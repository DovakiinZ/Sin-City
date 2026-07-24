# Email Verification Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force every registered user to verify their email within 5 days via an app-controlled magic link, restricting (not deleting) unverified accounts past the deadline and auto-restoring them on verification.

**Architecture:** Application-level verification state in a `user_verification` table (Supabase `auth.users` stays the source of truth for `created_at` + identity). A magic link we mint/hash/expire drives `email_verified_at`. Post-deadline restriction is enforced primarily at the DB via an RLS helper `account_can_write()`, backed by API checks and frontend gating. An hourly, `CRON_SECRET`-secured Vercel cron sends staged reminders and flips accounts to `verification_overdue` — idempotently. Pure decision logic lives in a framework-free module so it is unit-testable with Vitest.

**Tech Stack:** Vite + React + TypeScript SPA, Supabase (Postgres + Auth + RLS), Vercel serverless functions (`@vercel/node`), Resend email, Vitest (new).

## Global Constraints

- **Verification signal is app-level `user_verification.email_verified_at`** — NEVER `auth.users.email_confirmed_at` (it is auto-confirmed/meaningless here).
- **Do not** change the Supabase `mailer_autoconfirm` setting; **do not** hard-delete real accounts (restriction is reversible).
- Tokens: single-use, SHA-256 hashed at rest (raw only in the emailed URL), expire in 24h.
- Grace window: **5 days**. Deadline = `max(auth.users.created_at, LAUNCH_DATE) + 5 days`.
- `LAUNCH_DATE` single source = env `EMAIL_VERIFICATION_LAUNCH_DATE`; deploy seeds it into `public.verification_config` so the DB trigger and cron never drift.
- Cron: hourly (`0 * * * *`), Bearer-authed with `CRON_SECRET`.
- Reminders: stages at (1) 2 days after signup, (2) <48h remaining, (3) <6h remaining; **max one per rolling 24h**; each stage once. Bitmask `reminders_sent` + `last_reminder_sent_at`.
- Rate limits: per-user (60s cooldown, ≤5/24h) **and** per-IP (≤10/hour). Reuse `api/lib/ip-utils.ts`.
- Anti-enumeration: resend/verify endpoints never reveal whether an email/user exists; generic responses.
- All state changes are idempotent; cron retries are safe.
- Audit every transition to `public.verification_events`: `VerificationEmailSent`, `VerificationReminderSent`, `VerificationDeadlineExpired`, `AccountRestricted`, `EmailVerified`, `AccountRestored`.
- Restricted (`verification_overdue`|`suspended`) users: MAY sign in, view content, verify, resend, change email, edit limited profile fields (display_name, bio, avatar), logout, contact support. MUST NOT: post, comment, DM, like/follow/react, upload, or other sensitive business actions.
- Env vars used by functions: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `CRON_SECRET`, `EMAIL_VERIFICATION_LAUNCH_DATE`, `PUBLIC_APP_URL`.

---

## File Structure

**Create:**
- `supabase/add-email-verification.sql` — tables, config, trigger, backfill, helper fn, audit, admin RPCs, rate-limit table.
- `supabase/gate-write-policies-email-verification.sql` — drop/recreate write RLS on gated tables with `account_can_write()`.
- `api/lib/verification-state.ts` — pure decision logic (shared by cron + tests).
- `api/lib/verification-db.ts` — service-role Supabase client + typed row helpers + audit insert.
- `api/lib/verification-email.ts` — Resend magic-link + reminder email senders.
- `api/send-email-verification.ts` — authed resend endpoint (user+IP rate limited, anti-enumeration).
- `api/verify-email.ts` — consume token → set `email_verified_at`.
- `api/change-email.ts` — change email, invalidate tokens, re-enter unverified flow.
- `api/cron/enforce-email-verification.ts` — hourly reminders + restriction.
- `api/admin/verification.ts` — admin list + manual verify/restore (admin-guarded).
- `src/hooks/useVerification.ts` — reads verification state, exposes resend/changeEmail.
- `src/components/VerifyEmailBanner.tsx` — countdown + resend.
- `src/components/RestrictionGuard.tsx` — route allow-list gating for restricted users.
- `src/pages/VerifyEmail.tsx` — link landing page.
- `api/lib/__tests__/verification-state.test.ts` — Vitest unit tests (8 required cases).
- `vitest.config.ts` — test runner config.

**Modify:**
- `src/context/AuthContext.tsx` — expose verification state; call resend on register.
- `src/App.tsx` (or router root) — mount banner, guard, `/verify-email` route.
- `src/pages/AdminDashboard.tsx` — verification admin panel.
- `vercel.json` — add `crons`.
- `package.json` — add `test` script + `vitest`, `@supabase/supabase-js` (already present).

---

## Task 1: Test tooling (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm test` runs Vitest in Node environment.

- [ ] **Step 1: Add Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Add test script + dev dep**

Run:
```bash
npm install -D vitest
```
Then add to `package.json` `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Verify runner works (no tests yet)**

Run: `npm test`
Expected: exits 0 with "No test files found" (or similar) — runner is installed.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Pure verification-state decision module

**Files:**
- Create: `api/lib/verification-state.ts`
- Test: `api/lib/__tests__/verification-state.test.ts`

**Interfaces:**
- Produces:
  - `type AccountStatus = 'active' | 'verification_overdue' | 'suspended'`
  - `interface VerificationRow { created_at: string; verification_deadline: string; email_verified_at: string | null; account_status: AccountStatus; reminders_sent: number; last_reminder_sent_at: string | null; last_sent_at: string | null; send_count: number; }`
  - `const GRACE_MS = 5*24*60*60*1000`
  - `computeDeadline(createdAtIso: string, launchDateIso: string): string`
  - `remainingMs(nowIso: string, deadlineIso: string): number`
  - `isVerified(row): boolean`
  - `isRestricted(row): boolean` (status is overdue|suspended)
  - `shouldRestrict(row, nowIso): boolean`
  - `REMINDER_STAGES` and `dueReminderStage(row, nowIso): 0|1|2|3` (0 = none due)
  - `canResendUser(row, nowIso): { ok: boolean; reason?: 'cooldown'|'rate_limit' }`
  - `RESEND_COOLDOWN_MS = 60_000`, `MAX_SENDS_PER_DAY = 5`

- [ ] **Step 1: Write the failing tests (all 8 required cases)**

```ts
// api/lib/__tests__/verification-state.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeDeadline, remainingMs, isVerified, isRestricted, shouldRestrict,
  dueReminderStage, canResendUser, GRACE_MS,
} from '../verification-state';

const base = {
  created_at: '2026-07-25T00:00:00Z',
  verification_deadline: '2026-07-30T00:00:00Z', // +5d
  email_verified_at: null,
  account_status: 'active' as const,
  reminders_sent: 0,
  last_reminder_sent_at: null,
  last_sent_at: null,
  send_count: 0,
};

describe('deadline + grandfathering', () => {
  it('deadline = created_at + 5d when created after launch', () => {
    expect(computeDeadline('2026-07-25T00:00:00Z', '2026-01-01T00:00:00Z'))
      .toBe(new Date(Date.parse('2026-07-25T00:00:00Z') + GRACE_MS).toISOString());
  });
  it('grandfathers existing user: deadline = launch + 5d when created before launch', () => {
    expect(computeDeadline('2026-01-01T00:00:00Z', '2026-07-25T00:00:00Z'))
      .toBe(new Date(Date.parse('2026-07-25T00:00:00Z') + GRACE_MS).toISOString());
  });
});

describe('newly registered unverified user (within grace)', () => {
  it('not restricted, positive remaining time, no restrict', () => {
    const now = '2026-07-26T00:00:00Z';
    expect(isVerified(base)).toBe(false);
    expect(isRestricted(base)).toBe(false);
    expect(remainingMs(now, base.verification_deadline)).toBeGreaterThan(0);
    expect(shouldRestrict(base, now)).toBe(false);
  });
});

describe('verified user', () => {
  it('never restricted, never reminded', () => {
    const row = { ...base, email_verified_at: '2026-07-26T00:00:00Z' };
    const now = '2026-08-10T00:00:00Z';
    expect(isVerified(row)).toBe(true);
    expect(shouldRestrict(row, now)).toBe(false);
    expect(dueReminderStage(row, now)).toBe(0);
  });
});

describe('user past deadline', () => {
  it('shouldRestrict true when active + unverified + past deadline', () => {
    const now = '2026-07-31T00:00:00Z';
    expect(shouldRestrict(base, now)).toBe(true);
  });
  it('shouldRestrict false when already overdue (idempotent)', () => {
    const row = { ...base, account_status: 'verification_overdue' as const };
    expect(shouldRestrict(row, '2026-07-31T00:00:00Z')).toBe(false);
  });
});

describe('reminder staging + 24h dedup', () => {
  it('stage 1 due 2 days after signup', () => {
    expect(dueReminderStage(base, '2026-07-27T01:00:00Z')).toBe(1);
  });
  it('no reminder within 24h of last', () => {
    const row = { ...base, reminders_sent: 0b001, last_reminder_sent_at: '2026-07-27T01:00:00Z' };
    expect(dueReminderStage(row, '2026-07-27T12:00:00Z')).toBe(0); // <24h
  });
  it('stage 2 due when <48h remain and 24h since last', () => {
    const row = { ...base, reminders_sent: 0b001, last_reminder_sent_at: '2026-07-27T01:00:00Z' };
    expect(dueReminderStage(row, '2026-07-28T06:00:00Z')).toBe(2); // >24h, <48h remain
  });
  it('stage never repeats', () => {
    const row = { ...base, reminders_sent: 0b111, last_reminder_sent_at: '2026-07-29T23:00:00Z' };
    expect(dueReminderStage(row, '2026-07-29T23:30:00Z')).toBe(0);
  });
});

describe('resend cooldown + rate limit', () => {
  it('blocks within 60s cooldown', () => {
    const row = { ...base, last_sent_at: '2026-07-26T00:00:30Z' };
    expect(canResendUser(row, '2026-07-26T00:00:45Z')).toEqual({ ok: false, reason: 'cooldown' });
  });
  it('blocks after 5 sends in 24h', () => {
    const row = { ...base, send_count: 5, last_sent_at: '2026-07-26T00:00:00Z' };
    expect(canResendUser(row, '2026-07-26T00:05:00Z')).toEqual({ ok: false, reason: 'rate_limit' });
  });
  it('allows when cooldown elapsed and under cap', () => {
    const row = { ...base, send_count: 1, last_sent_at: '2026-07-26T00:00:00Z' };
    expect(canResendUser(row, '2026-07-26T00:02:00Z')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `../verification-state`.

- [ ] **Step 3: Implement the module**

```ts
// api/lib/verification-state.ts
export type AccountStatus = 'active' | 'verification_overdue' | 'suspended';

export interface VerificationRow {
  created_at: string;
  verification_deadline: string;
  email_verified_at: string | null;
  account_status: AccountStatus;
  reminders_sent: number;
  last_reminder_sent_at: string | null;
  last_sent_at: string | null;
  send_count: number;
}

export const GRACE_MS = 5 * 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;
const H6 = 6 * 60 * 60 * 1000;

export function computeDeadline(createdAtIso: string, launchDateIso: string): string {
  const floor = Math.max(Date.parse(createdAtIso), Date.parse(launchDateIso));
  return new Date(floor + GRACE_MS).toISOString();
}

export function remainingMs(nowIso: string, deadlineIso: string): number {
  return Date.parse(deadlineIso) - Date.parse(nowIso);
}

export function isVerified(row: VerificationRow): boolean {
  return row.email_verified_at != null;
}

export function isRestricted(row: VerificationRow): boolean {
  return row.account_status === 'verification_overdue' || row.account_status === 'suspended';
}

export function shouldRestrict(row: VerificationRow, nowIso: string): boolean {
  return row.account_status === 'active'
    && !isVerified(row)
    && remainingMs(nowIso, row.verification_deadline) <= 0;
}

// stage bits: 1 -> bit0, 2 -> bit1, 3 -> bit2
export function dueReminderStage(row: VerificationRow, nowIso: string): 0 | 1 | 2 | 3 {
  if (isVerified(row) || isRestricted(row)) return 0;
  const now = Date.parse(nowIso);
  if (row.last_reminder_sent_at && now - Date.parse(row.last_reminder_sent_at) < DAY_MS) return 0;
  const sinceSignup = now - Date.parse(row.created_at);
  const remain = Date.parse(row.verification_deadline) - now;
  const sent = row.reminders_sent;
  // Evaluate latest-eligible stage first so we never emit a stale earlier stage.
  if (!(sent & 0b100) && remain <= H6 && remain > 0) return 3;
  if (!(sent & 0b010) && remain <= H48 && remain > 0) return 2;
  if (!(sent & 0b001) && sinceSignup >= 2 * DAY_MS && remain > 0) return 1;
  return 0;
}

export function canResendUser(
  row: VerificationRow, nowIso: string,
): { ok: boolean; reason?: 'cooldown' | 'rate_limit' } {
  const now = Date.parse(nowIso);
  if (row.last_sent_at && now - Date.parse(row.last_sent_at) < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' };
  }
  // send_count is a rolling 24h counter (reset by DB when window passes).
  if (row.send_count >= MAX_SENDS_PER_DAY) return { ok: false, reason: 'rate_limit' };
  return { ok: true };
}

export function stageBit(stage: 1 | 2 | 3): number {
  return 1 << (stage - 1);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS — all describe blocks green (covers required cases: new unverified, verified, within grace, past deadline, grandfathering, resend cooldown, repeated-stage idempotency; auto-restore + repeated-cron verified at DB layer in Task 10 checks).

- [ ] **Step 5: Commit**

```bash
git add api/lib/verification-state.ts api/lib/__tests__/verification-state.test.ts
git commit -m "feat: pure verification-state decision module with tests"
```

---

## Task 3: Database migration — tables, config, trigger, backfill, helper, audit

**Files:**
- Create: `supabase/add-email-verification.sql`

**Interfaces:**
- Produces (DB objects other tasks depend on):
  - table `public.user_verification(user_id pk, email, verification_deadline, email_verified_at, account_status, reminders_sent, last_reminder_sent_at, suspended_at, suspension_reason, token_hash, token_expires_at, last_sent_at, send_count, send_window_start, created_at)`
  - table `public.verification_events(id, user_id, event_type, metadata jsonb, created_at)`
  - table `public.verification_config(id bool pk default true, launch_date timestamptz)`
  - table `public.verification_rate_limits(ip_hash text, window_start timestamptz, count int, pk(ip_hash))`
  - fn `public.account_can_write() returns boolean` (SECURITY DEFINER)
  - fn `public.is_admin(uuid) returns boolean`
  - trigger `handle_new_user_verification` on `auth.users`
  - trigger `restore_on_verify` on `public.user_verification`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/add-email-verification.sql
-- Email verification enforcement: application-level verification state.
-- Idempotent: safe to re-run.

-- 1) Config singleton (single source for LAUNCH_DATE; deploy seeds launch_date).
CREATE TABLE IF NOT EXISTS public.verification_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  launch_date timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.verification_config (id, launch_date)
VALUES (true, now()) ON CONFLICT (id) DO NOTHING;

-- 2) Main verification state table.
CREATE TABLE IF NOT EXISTS public.user_verification (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  verification_deadline timestamptz NOT NULL,
  email_verified_at timestamptz,
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active','verification_overdue','suspended')),
  reminders_sent int NOT NULL DEFAULT 0,
  last_reminder_sent_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  token_hash text,
  token_expires_at timestamptz,
  last_sent_at timestamptz,
  send_count int NOT NULL DEFAULT 0,
  send_window_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_verification_status ON public.user_verification(account_status);
CREATE INDEX IF NOT EXISTS idx_user_verification_deadline ON public.user_verification(verification_deadline);
CREATE INDEX IF NOT EXISTS idx_user_verification_token ON public.user_verification(token_hash);

-- 3) Audit events.
CREATE TABLE IF NOT EXISTS public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'VerificationEmailSent','VerificationReminderSent','VerificationDeadlineExpired',
    'AccountRestricted','EmailVerified','AccountRestored','EmailChanged','ProbeCleanup'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_events_user ON public.verification_events(user_id, created_at DESC);

-- 4) Per-IP rate limit.
CREATE TABLE IF NOT EXISTS public.verification_rate_limits (
  ip_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0
);

-- 5) is_admin helper (reads profiles.role).
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role = 'admin');
$$;

-- 6) account_can_write(): the RLS gate. True unless caller is restricted.
CREATE OR REPLACE FUNCTION public.account_can_write()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT uv.account_status = 'active'
       FROM public.user_verification uv
      WHERE uv.user_id = auth.uid()),
    true  -- no row (e.g. anon/guest or pre-trigger) -> do not block here
  );
$$;

-- 7) Deadline compute using config.
CREATE OR REPLACE FUNCTION public.compute_verification_deadline(created timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT GREATEST(created, (SELECT launch_date FROM public.verification_config WHERE id))
         + interval '5 days';
$$;

-- 8) Trigger: create a verification row for every new auth user.
CREATE OR REPLACE FUNCTION public.handle_new_user_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_verification (user_id, email, verification_deadline)
  VALUES (NEW.id, NEW.email, public.compute_verification_deadline(NEW.created_at))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created_verification ON auth.users;
CREATE TRIGGER on_auth_user_created_verification
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_verification();

-- 9) Trigger: auto-restore on verification (email_verified_at NULL -> NOT NULL).
CREATE OR REPLACE FUNCTION public.restore_on_verify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.email_verified_at IS NULL AND NEW.email_verified_at IS NOT NULL THEN
    NEW.account_status := 'active';
    NEW.suspended_at := NULL;
    NEW.suspension_reason := NULL;
    NEW.token_hash := NULL;
    NEW.token_expires_at := NULL;
    INSERT INTO public.verification_events(user_id, event_type, metadata)
    VALUES (NEW.user_id, 'EmailVerified', '{}'::jsonb),
           (NEW.user_id, 'AccountRestored', jsonb_build_object('auto', true));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_restore_on_verify ON public.user_verification;
CREATE TRIGGER trg_restore_on_verify
  BEFORE UPDATE ON public.user_verification
  FOR EACH ROW EXECUTE FUNCTION public.restore_on_verify();

-- 10) Backfill existing users (grandfather).
INSERT INTO public.user_verification (user_id, email, verification_deadline)
SELECT u.id, u.email, public.compute_verification_deadline(u.created_at)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_verification v WHERE v.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- 11) RLS: users read only their own row; no client writes.
ALTER TABLE public.user_verification ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own verification readable" ON public.user_verification;
CREATE POLICY "own verification readable" ON public.user_verification
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read verification events" ON public.verification_events;
CREATE POLICY "admins read verification events" ON public.verification_events
  FOR SELECT USING (public.is_admin(auth.uid()));
```

- [ ] **Step 2: Apply the migration**

Run in Supabase SQL editor (or `supabase db` if CLI configured). Paste the file contents and execute.
Expected: no errors; `SELECT count(*) FROM public.user_verification;` equals the number of `auth.users` (backfill worked).

- [ ] **Step 3: Manual verification queries**

```sql
-- Trigger works for new signups (create a throwaway via dashboard or app, then):
SELECT user_id, verification_deadline, account_status, email_verified_at
FROM public.user_verification ORDER BY created_at DESC LIMIT 5;
-- Grandfather floor applied:
SELECT launch_date FROM public.verification_config;
```
Expected: every user has a row; deadlines are `max(created_at, launch_date)+5d`.

- [ ] **Step 4: Commit**

```bash
git add supabase/add-email-verification.sql
git commit -m "feat(db): user_verification schema, config, triggers, backfill, RLS helper"
```

---

## Task 4: Gate write RLS policies with `account_can_write()`

**Files:**
- Create: `supabase/gate-write-policies-email-verification.sql`

**Interfaces:**
- Consumes: `public.account_can_write()` from Task 3.
- Produces: authoritative INSERT/UPDATE policies on gated tables that also require `account_can_write()`.

**Note:** Because prior policies are spread across many files with overrides, this migration DROPs the known write policies on each gated table and recreates a single authoritative one incorporating the gate. Read-only (SELECT) policies are left untouched so restricted users can still view content.

- [ ] **Step 1: Write the gating migration**

```sql
-- supabase/gate-write-policies-email-verification.sql
-- Restrict writes for verification_overdue/suspended users at the DB boundary.
-- SELECT policies are intentionally NOT modified (restricted users can still read).

-- POSTS -------------------------------------------------------------
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_anyone" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
CREATE POLICY "posts_insert" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.account_can_write());
DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.account_can_write());

-- COMMENTS ----------------------------------------------------------
DROP POLICY IF EXISTS "comments_insert_anyone" ON public.comments;
DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- DIRECT MESSAGES ---------------------------------------------------
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());
-- session/chat message tables (guard whichever exist as user-writable)
DROP POLICY IF EXISTS "session_messages_insert" ON public.session_messages;
CREATE POLICY "session_messages_insert" ON public.session_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- FOLLOWS -----------------------------------------------------------
DROP POLICY IF EXISTS "follows_insert" ON public.follows;
CREATE POLICY "follows_insert" ON public.follows
  FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- REACTIONS (likes) -------------------------------------------------
DROP POLICY IF EXISTS "reactions_insert" ON public.reactions;
CREATE POLICY "reactions_insert" ON public.reactions
  FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- POLL VOTES --------------------------------------------------------
DROP POLICY IF EXISTS "Users can vote once" ON public.post_poll_votes;
CREATE POLICY "Users can vote once" ON public.post_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- BOOKMARKS ---------------------------------------------------------
DROP POLICY IF EXISTS "Users can create own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can create own bookmarks" ON public.bookmarks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.account_can_write());

-- STORAGE UPLOADS ---------------------------------------------------
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads (verified only)" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());
```

> Implementation note: before running, `\d+` each table to confirm the actual column names (`user_id` vs `author_id`) and the exact current policy names via `SELECT policyname FROM pg_policies WHERE tablename = '<t>';`. Adjust DROP names to match; keep the `account_can_write()` clause identical. Do not touch guest/anon insert policies for anonymous posting — those have no `auth.uid()` and `account_can_write()` returns true for them (no row).

- [ ] **Step 2: Apply and verify enforcement**

Apply the file. Then, as a restricted test user (set their row to overdue):
```sql
UPDATE public.user_verification SET account_status='verification_overdue'
WHERE user_id = '<test-user-id>';
```
Attempt an insert into `posts` as that user (via the app or `supabase-js` with their JWT). Expected: RLS denies (`new row violates row-level security policy`). Set back to `active` → insert succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/gate-write-policies-email-verification.sql
git commit -m "feat(db): gate write policies behind account_can_write()"
```

---

## Task 5: Service-role DB helper + email senders

**Files:**
- Create: `api/lib/verification-db.ts`, `api/lib/verification-email.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js`, env vars.
- Produces:
  - `verification-db.ts`: `getServiceClient()`, `getVerification(userId)`, `getVerificationByTokenHash(hash)`, `updateVerification(userId, patch)`, `logEvent(userId, type, metadata?)`, `hashToken(raw)`, `newToken()`, `launchDate()`.
  - `verification-email.ts`: `sendVerificationEmail(to, link)`, `sendReminderEmail(to, link, stage, remainingHours)` → `Promise<string|null>` (error msg or null).

- [ ] **Step 1: Implement `verification-db.ts`**

```ts
// api/lib/verification-db.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function getServiceClient(): SupabaseClient {
  if (!url || !serviceKey) throw new Error('Supabase service config missing');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function getVerification(userId: string) {
  const { data, error } = await getServiceClient()
    .from('user_verification').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getVerificationByTokenHash(hash: string) {
  const { data, error } = await getServiceClient()
    .from('user_verification').select('*').eq('token_hash', hash).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateVerification(userId: string, patch: Record<string, unknown>) {
  const { error } = await getServiceClient()
    .from('user_verification').update(patch).eq('user_id', userId);
  if (error) throw error;
}

export async function logEvent(userId: string | null, type: string, metadata: Record<string, unknown> = {}) {
  await getServiceClient().from('verification_events').insert({ user_id: userId, event_type: type, metadata });
}

export async function launchDate(): Promise<string> {
  const envDate = process.env.EMAIL_VERIFICATION_LAUNCH_DATE;
  if (envDate) return new Date(envDate).toISOString();
  const { data } = await getServiceClient().from('verification_config').select('launch_date').eq('id', true).maybeSingle();
  return data?.launch_date ?? new Date().toISOString();
}
```

- [ ] **Step 2: Implement `verification-email.ts`** (reuse the Resend pattern from `api/send-verification.ts`)

```ts
// api/lib/verification-email.ts
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Sin City <onboarding@resend.dev>';

async function send(to: string, subject: string, html: string): Promise<string | null> {
  if (!RESEND_API_KEY) return 'RESEND_API_KEY not configured';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); return `Resend error: ${e.message || res.status}`; }
    return null;
  } catch (e: any) { return `Email send failed: ${e.message || 'unknown'}`; }
}

const shell = (inner: string) => `
  <div style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:40px;max-width:520px;margin:0 auto;">
    <h1 style="border-bottom:1px solid #22c55e;padding-bottom:16px;">Sin City</h1>${inner}
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #333;font-size:12px;color:#666;">Sin City</div>
  </div>`;

const button = (link: string, label: string) =>
  `<p><a href="${link}" style="display:inline-block;background:#22c55e;color:#0a0a0a;padding:12px 20px;text-decoration:none;font-weight:bold;">${label}</a></p>
   <p style="font-size:12px;color:#888;">Or paste this link:<br>${link}</p>`;

export function sendVerificationEmail(to: string, link: string) {
  return send(to, 'Verify your Sin City email', shell(
    `<p>Confirm your email to keep your account active. This link expires in 24 hours.</p>${button(link, 'Verify email')}`));
}

export function sendReminderEmail(to: string, link: string, stage: number, remainingHours: number) {
  return send(to, 'Action needed: verify your Sin City email', shell(
    `<p>Your account will be restricted in about ${Math.max(0, Math.round(remainingHours))} hours if you don't verify.</p>${button(link, 'Verify now')}`));
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add api/lib/verification-db.ts api/lib/verification-email.ts
git commit -m "feat(api): verification DB helper + email senders"
```

---

## Task 6: `send-email-verification` endpoint (authed, rate-limited, anti-enumeration)

**Files:**
- Create: `api/send-email-verification.ts`

**Interfaces:**
- Consumes: `verification-db.ts`, `verification-state.ts`, `verification-email.ts`, `api/lib/ip-utils.ts`.
- Produces: `POST /api/send-email-verification` with `Authorization: Bearer <user access_token>`. Always returns `{ ok: true }` (generic) unless malformed.

- [ ] **Step 1: Implement the endpoint**

```ts
// api/send-email-verification.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification, logEvent, newToken, hashToken } from './lib/verification-db';
import { canResendUser } from './lib/verification-state';
import { sendVerificationEmail } from './lib/verification-email';
import { getClientIp } from './lib/ip-utils';
import crypto from 'node:crypto';

const APP_URL = process.env.PUBLIC_APP_URL || '';
const IP_LIMIT = 10; // per hour

async function ipAllowed(ipHash: string): Promise<boolean> {
  const sb = getServiceClient();
  const { data } = await sb.from('verification_rate_limits').select('*').eq('ip_hash', ipHash).maybeSingle();
  const now = Date.now();
  if (!data || now - Date.parse(data.window_start) > 3600_000) {
    await sb.from('verification_rate_limits').upsert({ ip_hash: ipHash, window_start: new Date().toISOString(), count: 1 });
    return true;
  }
  if (data.count >= IP_LIMIT) return false;
  await sb.from('verification_rate_limits').update({ count: data.count + 1 }).eq('ip_hash', ipHash);
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const generic = () => res.status(200).json({ ok: true }); // anti-enumeration
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return generic();

    // Resolve the caller identity from their JWT.
    const { data: { user } } = await getServiceClient().auth.getUser(token);
    if (!user) return generic();

    const ipHash = crypto.createHash('sha256').update(getClientIp(req) || 'unknown').digest('hex');
    if (!(await ipAllowed(ipHash))) return generic();

    const row = await getVerification(user.id);
    if (!row || row.email_verified_at) return generic(); // already verified or no row

    const nowIso = new Date().toISOString();
    // reset rolling 24h send window
    let sendCount = row.send_count;
    if (!row.send_window_start || Date.now() - Date.parse(row.send_window_start) > 86400_000) sendCount = 0;
    const gate = canResendUser({ ...row, send_count: sendCount }, nowIso);
    if (!gate.ok) return generic();

    const raw = newToken();
    await updateVerification(user.id, {
      token_hash: hashToken(raw),
      token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
      last_sent_at: nowIso,
      send_count: sendCount + 1,
      send_window_start: row.send_window_start && sendCount !== 0 ? row.send_window_start : nowIso,
      email: user.email,
    });
    const link = `${APP_URL}/verify-email?token=${raw}`;
    const err = await sendVerificationEmail(user.email!, link);
    if (!err) await logEvent(user.id, 'VerificationEmailSent', { ip_hash: ipHash });
    return generic();
  } catch (e) {
    console.error('[send-email-verification]', e);
    return res.status(200).json({ ok: true }); // still generic
  }
}
```

- [ ] **Step 2: Confirm `getClientIp` export exists**

Run: `grep -n "export" api/lib/ip-utils.ts`
Expected: a `getClientIp` (or equivalent) export. If the name differs, adjust the import to match the actual export.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/send-email-verification.ts
git commit -m "feat(api): send-email-verification with user+IP rate limits, anti-enumeration"
```

---

## Task 7: `verify-email` endpoint (consume token, single-use)

**Files:**
- Create: `api/verify-email.ts`

**Interfaces:**
- Consumes: `verification-db.ts`.
- Produces: `POST /api/verify-email` `{ token }` → generic `{ ok, verified }`. Setting `email_verified_at` fires the DB restore trigger (Task 3).

- [ ] **Step 1: Implement**

```ts
// api/verify-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getVerificationByTokenHash, updateVerification, hashToken } from './lib/verification-db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const fail = () => res.status(200).json({ ok: true, verified: false }); // generic
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') return fail();
    const row = await getVerificationByTokenHash(hashToken(token));
    if (!row) return fail();                          // unknown token — do not reveal
    if (row.email_verified_at) return res.status(200).json({ ok: true, verified: true }); // idempotent
    if (!row.token_expires_at || Date.parse(row.token_expires_at) < Date.now()) return fail(); // expired
    // Single-use: setting verified clears token via restore trigger; also null it here.
    await updateVerification(row.user_id, { email_verified_at: new Date().toISOString(), token_hash: null, token_expires_at: null });
    return res.status(200).json({ ok: true, verified: true });
  } catch (e) {
    console.error('[verify-email]', e);
    return res.status(200).json({ ok: true, verified: false });
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit -p tsconfig.json` → no errors.

- [ ] **Step 3: Commit**

```bash
git add api/verify-email.ts
git commit -m "feat(api): verify-email single-use token consumption"
```

---

## Task 8: `change-email` endpoint (invalidate tokens, re-enter unverified)

**Files:**
- Create: `api/change-email.ts`

**Interfaces:**
- Consumes: `verification-db.ts`, Supabase admin `auth.admin.updateUserById`.
- Produces: `POST /api/change-email` `{ new_email }` (Bearer user token). Updates auth email, resets verification, retains deadline unless already-verified (then `now+5d`), invalidates tokens, emits `EmailChanged`, then triggers a fresh send.

- [ ] **Step 1: Implement**

```ts
// api/change-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification, logEvent } from './lib/verification-db';
import { GRACE_MS } from './lib/verification-state';

function validEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { new_email } = req.body || {};
    if (!token || !new_email || !validEmail(new_email)) return res.status(200).json({ ok: true }); // generic
    const sb = getServiceClient();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return res.status(200).json({ ok: true });

    const row = await getVerification(user.id);
    const wasVerified = !!row?.email_verified_at;

    // Update auth email (admin; auto-confirmed project so this is immediate).
    await sb.auth.admin.updateUserById(user.id, { email: new_email });

    const patch: Record<string, unknown> = {
      email: new_email,
      email_verified_at: null,
      token_hash: null,
      token_expires_at: null,
    };
    // Deadline policy: retain original unless already verified -> fresh 5d window.
    if (wasVerified) {
      patch.verification_deadline = new Date(Date.now() + GRACE_MS).toISOString();
      patch.account_status = 'active';
      patch.suspended_at = null;
      patch.suspension_reason = null;
      patch.reminders_sent = 0;
      patch.last_reminder_sent_at = null;
    }
    await updateVerification(user.id, patch);
    await logEvent(user.id, 'EmailChanged', { was_verified: wasVerified });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[change-email]', e);
    return res.status(200).json({ ok: true });
  }
}
```

- [ ] **Step 2: Typecheck** → no errors.

- [ ] **Step 3: Commit**

```bash
git add api/change-email.ts
git commit -m "feat(api): change-email invalidates tokens and re-enters verification"
```

---

## Task 9: Hourly cron — reminders + restriction (idempotent)

**Files:**
- Create: `api/cron/enforce-email-verification.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `verification-db.ts`, `verification-state.ts`, `verification-email.ts`.
- Produces: `GET /api/cron/enforce-email-verification` (Bearer `CRON_SECRET`). Returns `{ reminded, restricted }` counts.

- [ ] **Step 1: Implement the cron**

```ts
// api/cron/enforce-email-verification.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, logEvent, newToken, hashToken } from '../lib/verification-db';
import { dueReminderStage, stageBit, remainingMs } from '../lib/verification-state';
import { sendReminderEmail } from '../lib/verification-email';

const APP_URL = process.env.PUBLIC_APP_URL || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' });

  const sb = getServiceClient();
  const nowIso = new Date().toISOString();
  let reminded = 0, restricted = 0;

  // --- Pass 1: restriction (idempotent via WHERE status='active') ---
  const { data: toRestrict } = await sb.from('user_verification')
    .update({ account_status: 'verification_overdue', suspended_at: nowIso, suspension_reason: 'email_not_verified' })
    .lt('verification_deadline', nowIso)
    .is('email_verified_at', null)
    .eq('account_status', 'active')
    .select('user_id');
  for (const r of toRestrict || []) {
    await logEvent(r.user_id, 'VerificationDeadlineExpired', {});
    await logEvent(r.user_id, 'AccountRestricted', { reason: 'email_not_verified' });
    restricted++;
  }

  // --- Pass 2: reminders (still within grace, unverified) ---
  const { data: candidates } = await sb.from('user_verification')
    .select('*')
    .is('email_verified_at', null)
    .eq('account_status', 'active');
  for (const row of candidates || []) {
    const stage = dueReminderStage(row, nowIso);
    if (stage === 0) continue;
    const raw = newToken();
    await sb.from('user_verification').update({
      reminders_sent: row.reminders_sent | stageBit(stage as 1 | 2 | 3),
      last_reminder_sent_at: nowIso,
      token_hash: hashToken(raw),
      token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
    }).eq('user_id', row.user_id);
    const hours = Math.max(0, remainingMs(nowIso, row.verification_deadline) / 3600_000);
    const err = await sendReminderEmail(row.email, `${APP_URL}/verify-email?token=${raw}`, stage, hours);
    if (!err) { await logEvent(row.user_id, 'VerificationReminderSent', { stage }); reminded++; }
  }

  return res.status(200).json({ reminded, restricted });
}
```

- [ ] **Step 2: Register the cron in `vercel.json`**

Add a top-level `"crons"` array (keep existing `rewrites`):
```json
"crons": [
  { "path": "/api/cron/enforce-email-verification", "schedule": "0 * * * *" }
]
```

- [ ] **Step 3: Local idempotency check**

Run twice against a deployed preview (or local `vercel dev`):
```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/cron/enforce-email-verification
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<preview>/api/cron/enforce-email-verification
```
Expected: first call may restrict/remind; **second call returns `{ "reminded": 0, "restricted": 0 }`** (idempotent). Unauthorized (no header) returns 401.

- [ ] **Step 4: Commit**

```bash
git add api/cron/enforce-email-verification.ts vercel.json
git commit -m "feat(api): hourly cron for reminders and restriction (idempotent)"
```

---

## Task 10: Admin endpoint — list + manual verify/restore (audited)

**Files:**
- Create: `api/admin/verification.ts`
- Add to `supabase/add-email-verification.sql` (or a follow-up file `supabase/admin-verification-rpcs.sql`): `admin_verify_user`, `admin_restore_user` RPCs.

**Interfaces:**
- Consumes: `verification-db.ts`, `is_admin`.
- Produces: `GET /api/admin/verification` (list w/ status, deadline, reminders, suspension) and `POST` `{ action: 'verify'|'restore', target, reason }`. Admin JWT required.

- [ ] **Step 1: Add admin RPCs (SQL)**

```sql
-- supabase/admin-verification-rpcs.sql
CREATE OR REPLACE FUNCTION public.admin_verify_user(target uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.user_verification
    SET email_verified_at = COALESCE(email_verified_at, now())
  WHERE user_id = target;  -- restore trigger fires EmailVerified + AccountRestored
  INSERT INTO public.verification_events(user_id, event_type, metadata)
  VALUES (target, 'AccountRestored', jsonb_build_object('by', auth.uid(), 'reason', reason, 'manual', true));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(target uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.user_verification
    SET account_status='active', suspended_at=NULL, suspension_reason=NULL
  WHERE user_id = target;
  INSERT INTO public.verification_events(user_id, event_type, metadata)
  VALUES (target, 'AccountRestored', jsonb_build_object('by', auth.uid(), 'reason', reason, 'manual', true));
END; $$;
```

- [ ] **Step 2: Implement the admin API**

```ts
// api/admin/verification.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../lib/verification-db';

async function requireAdmin(token: string) {
  const sb = getServiceClient();
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return null;
  const { data } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return data?.role === 'admin' ? user : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const admin = await requireAdmin(token);
  if (!admin) return res.status(403).json({ error: 'forbidden' });
  const sb = getServiceClient();

  if (req.method === 'GET') {
    const { data: rows } = await sb.from('user_verification')
      .select('user_id, email, account_status, verification_deadline, email_verified_at, reminders_sent, last_reminder_sent_at, suspended_at, suspension_reason')
      .order('verification_deadline', { ascending: true }).limit(500);
    return res.status(200).json({ rows: rows || [] });
  }
  if (req.method === 'POST') {
    const { action, target, reason } = req.body || {};
    if (!['verify', 'restore'].includes(action) || !target) return res.status(400).json({ error: 'bad request' });
    // Call the RPC as the admin (RLS/SECURITY DEFINER checks is_admin via auth.uid()).
    const asUser = getServiceClient();
    const fn = action === 'verify' ? 'admin_verify_user' : 'admin_restore_user';
    const { error } = await asUser.rpc(fn, { target, reason: reason || '' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
```

> Note: `SECURITY DEFINER` RPCs check `auth.uid()`. When called with the service key, `auth.uid()` is null, so the API pre-checks `requireAdmin` and the RPC guard is defense-in-depth. If you prefer the RPC guard to be the sole check, invoke it with a user-scoped client built from the admin's JWT instead of the service key.

- [ ] **Step 3: Apply SQL + typecheck**

Apply `admin-verification-rpcs.sql`. Run `npx tsc --noEmit`. Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/admin/verification.ts supabase/admin-verification-rpcs.sql
git commit -m "feat(api): admin verification list + manual verify/restore (audited)"
```

---

## Task 11: Frontend — verification hook + register wiring

**Files:**
- Create: `src/hooks/useVerification.ts`
- Modify: `src/context/AuthContext.tsx`

**Interfaces:**
- Consumes: `src/lib/supabase.ts`, endpoints from Tasks 6–8.
- Produces: `useVerification()` → `{ status, deadline, verifiedAt, loading, remainingMs, restricted, resend(), changeEmail(newEmail) }`.

- [ ] **Step 1: Implement the hook**

```ts
// src/hooks/useVerification.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Status = 'active' | 'verification_overdue' | 'suspended';
interface State { status: Status; deadline: string | null; verifiedAt: string | null; loading: boolean; }

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function useVerification() {
  const [s, setS] = useState<State>({ status: 'active', deadline: null, verifiedAt: null, loading: true });

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setS({ status: 'active', deadline: null, verifiedAt: null, loading: false }); return; }
    const { data } = await supabase.from('user_verification')
      .select('account_status, verification_deadline, email_verified_at').eq('user_id', user.id).maybeSingle();
    setS({
      status: (data?.account_status as Status) ?? 'active',
      deadline: data?.verification_deadline ?? null,
      verifiedAt: data?.email_verified_at ?? null,
      loading: false,
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const resend = useCallback(async () => {
    await fetch('/api/send-email-verification', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) } });
  }, []);
  const changeEmail = useCallback(async (new_email: string) => {
    await fetch('/api/change-email', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ new_email }) });
    await refresh();
  }, [refresh]);

  const remaining = s.deadline ? Date.parse(s.deadline) - Date.now() : 0;
  return { ...s, remainingMs: remaining, restricted: s.status !== 'active' && !s.verifiedAt, resend, changeEmail, refresh };
}
```

- [ ] **Step 2: Trigger the first verification email at register**

In `src/context/AuthContext.tsx`, inside `register(...)` after a successful `signUp` that returns a session (the `if (data.session && data.user)` branch), add a fire-and-forget send:
```ts
// after setUser(mapped);
try {
  await fetch('/api/send-email-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
  });
} catch { /* non-critical; banner + cron will recover */ }
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useVerification.ts src/context/AuthContext.tsx
git commit -m "feat(web): useVerification hook + send verification on register"
```

---

## Task 12: Frontend — banner, verify page, restriction guard

**Files:**
- Create: `src/components/VerifyEmailBanner.tsx`, `src/pages/VerifyEmail.tsx`, `src/components/RestrictionGuard.tsx`
- Modify: `src/App.tsx` (router root)

**Interfaces:**
- Consumes: `useVerification`.
- Produces: app-wide banner, `/verify-email` route, restricted-route gating (allow-list: `/verify-email`, `/support`, `/contact`, logout).

- [ ] **Step 1: Banner with live countdown + resend**

```tsx
// src/components/VerifyEmailBanner.tsx
import { useEffect, useState } from 'react';
import { useVerification } from '@/hooks/useVerification';

function fmt(ms: number) {
  if (ms <= 0) return '0h 0m';
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${m}m`;
}

export default function VerifyEmailBanner() {
  const { verifiedAt, deadline, loading, resend } = useVerification();
  const [now, setNow] = useState(Date.now());
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown(c => c - 1), 1000); return () => clearInterval(t); }, [cooldown]);

  if (loading || verifiedAt || !deadline) return null;
  const remaining = Date.parse(deadline) - now;
  const overdue = remaining <= 0;

  return (
    <div className="w-full bg-black border-b border-green-700 text-green-400 font-mono text-sm px-4 py-2 flex items-center justify-between">
      <span>
        {overdue
          ? 'Your account is restricted until you verify your email.'
          : `Verify your email within ${fmt(remaining)} or your account will be restricted.`}
      </span>
      <button
        className="border border-green-700 px-3 py-1 disabled:opacity-50"
        disabled={cooldown > 0}
        onClick={async () => { await resend(); setSent(true); setCooldown(60); }}
      >
        {cooldown > 0 ? `Resend (${cooldown}s)` : sent ? 'Resent' : 'Resend email'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify page (consumes token)**

```tsx
// src/pages/VerifyEmail.tsx
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'working' | 'ok' | 'fail'>('working');
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('fail'); return; }
    (async () => {
      const res = await fetch('/api/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const body = await res.json().catch(() => ({}));
      setState(body?.verified ? 'ok' : 'fail');
    })();
  }, [params]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-mono text-green-400 p-4">
      <div className="border border-green-700 p-6 bg-black/70 max-w-md w-full text-center">
        {state === 'working' && <p>Verifying…</p>}
        {state === 'ok' && <><p className="mb-3">Email verified. Your account is active.</p><Link className="underline" to="/">Continue</Link></>}
        {state === 'fail' && <p>This verification link is invalid or expired. Request a new one from the banner.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Restriction guard**

```tsx
// src/components/RestrictionGuard.tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useVerification } from '@/hooks/useVerification';

const ALLOW = ['/verify-email', '/support', '/contact'];

export default function RestrictionGuard({ children }: { children: React.ReactNode }) {
  const { restricted, loading } = useVerification();
  const loc = useLocation();
  if (loading) return <>{children}</>;
  if (restricted && !ALLOW.some(p => loc.pathname.startsWith(p))) {
    return <Navigate to="/verify-email" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Wire into `src/App.tsx`**

Mount `<VerifyEmailBanner />` above the routed content, add `<Route path="/verify-email" element={<VerifyEmail />} />`, and wrap the authenticated route subtree with `<RestrictionGuard>`. Follow the existing router structure in `src/App.tsx` (do not restructure unrelated routes).

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/VerifyEmailBanner.tsx src/pages/VerifyEmail.tsx src/components/RestrictionGuard.tsx src/App.tsx
git commit -m "feat(web): verification banner, verify page, restriction guard"
```

---

## Task 13: Admin dashboard panel

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`
- (Optional) Create: `src/components/admin/VerificationPanel.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/admin/verification`.
- Produces: a panel listing verification status/deadline/reminders/suspension with Verify/Restore buttons.

- [ ] **Step 1: Implement the panel component**

```tsx
// src/components/admin/VerificationPanel.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Row {
  user_id: string; email: string; account_status: string; verification_deadline: string;
  email_verified_at: string | null; reminders_sent: number; last_reminder_sent_at: string | null;
  suspended_at: string | null; suspension_reason: string | null;
}

async function hdr() {
  const { data: { session } } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` };
}
const stages = (m: number) => [1, 2, 3].filter(i => m & (1 << (i - 1))).join(',') || '—';

export default function VerificationPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = async () => {
    const res = await fetch('/api/admin/verification', { headers: await hdr() });
    const body = await res.json().catch(() => ({ rows: [] }));
    setRows(body.rows || []);
  };
  useEffect(() => { load(); }, []);
  const act = async (target: string, action: 'verify' | 'restore') => {
    const reason = window.prompt(`Reason for ${action}?`) || '';
    await fetch('/api/admin/verification', { method: 'POST', headers: await hdr(), body: JSON.stringify({ action, target, reason }) });
    await load();
  };

  return (
    <div className="font-mono text-green-400 text-xs overflow-x-auto">
      <table className="w-full border border-green-800">
        <thead><tr className="border-b border-green-800">
          <th className="text-left p-1">Email</th><th className="text-left p-1">Status</th>
          <th className="text-left p-1">Deadline</th><th className="text-left p-1">Verified</th>
          <th className="text-left p-1">Reminders</th><th className="text-left p-1">Suspended</th>
          <th className="text-left p-1">Actions</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.user_id} className="border-b border-green-900">
              <td className="p-1">{r.email}</td>
              <td className="p-1">{r.account_status}</td>
              <td className="p-1">{new Date(r.verification_deadline).toLocaleString()}</td>
              <td className="p-1">{r.email_verified_at ? '✓' : '—'}</td>
              <td className="p-1">{stages(r.reminders_sent)}</td>
              <td className="p-1">{r.suspended_at ? `${r.suspension_reason ?? ''}` : '—'}</td>
              <td className="p-1">
                <button className="underline mr-2" onClick={() => act(r.user_id, 'verify')}>verify</button>
                <button className="underline" onClick={() => act(r.user_id, 'restore')}>restore</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `AdminDashboard.tsx`**

Add a new section/tab rendering `<VerificationPanel />`, following the dashboard's existing section pattern.

- [ ] **Step 3: Build check** — `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/VerificationPanel.tsx src/pages/AdminDashboard.tsx
git commit -m "feat(web): admin verification panel with manual verify/restore"
```

---

## Task 14: End-to-end flow validation + probe-user cleanup

**Files:**
- Create: `scripts/verify-flow-check.mjs` (throwaway validation script) — optional but recommended.

**Interfaces:**
- Consumes: deployed preview or `vercel dev` with all env vars set.

- [ ] **Step 1: Full happy-path validation**

Using a fresh throwaway signup:
1. Register → confirm a `user_verification` row exists with `account_status='active'`, deadline `now+5d`, and a `VerificationEmailSent` event.
2. Click the emailed link (or POST the token to `/api/verify-email`) → row `email_verified_at` set, `EmailVerified` + `AccountRestored` events present, banner disappears.
3. Force overdue: `UPDATE user_verification SET account_status='verification_overdue', email_verified_at=NULL, verification_deadline=now()-interval '1 day' WHERE user_id=<id>` → attempt a post insert → RLS denies; frontend redirects to `/verify-email`.
4. Verify again → auto-restored, post insert succeeds.

Expected: all steps behave as described.

- [ ] **Step 2: Cron idempotency (already checked in Task 9) — re-confirm end-to-end**

Run the cron endpoint twice; second run reports `0/0`. Confirm no duplicate `VerificationReminderSent` rows for a user within 24h.

- [ ] **Step 3: Delete the probe user + audit**

Once the above passes, delete the probe user created during design verification:
```bash
node -e '
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false}});
(async () => {
  const { data } = await sb.auth.admin.listUsers();
  const u = data.users.find(x => x.email && x.email.startsWith("verify-probe+"));
  if (!u) { console.log("no probe user"); return; }
  await sb.from("verification_events").insert({ user_id: u.id, event_type: "ProbeCleanup", metadata: { probe_cleanup: true, email: u.email }});
  await sb.auth.admin.deleteUser(u.id);
  console.log("deleted probe user", u.email);
})();
'
```
Expected: prints "deleted probe user …"; a `ProbeCleanup` event is recorded (before cascade delete removes the FK-null'd event? — the event row uses `ON DELETE SET NULL`, so it persists with `user_id=null`).

- [ ] **Step 4: Run full test suite + build**

Run: `npm test && npm run build`
Expected: all Vitest tests pass; production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-flow-check.mjs 2>/dev/null || true
git commit -m "chore: verification flow validation + probe cleanup" --allow-empty
```

---

## Self-Review — spec coverage map

| Spec requirement | Task |
|---|---|
| Verify actual Supabase behavior before building | Done pre-plan (probe recorded in spec) |
| App-level state (`verification_deadline`, `email_verified_at`, `account_status`, reminders, `suspended_at`) | Task 3 |
| Grace access + banner + exact remaining time + resend cooldown/rate-limit | Tasks 11, 12, 6 |
| Post-deadline restriction at DB/API (allow/deny lists) | Tasks 4, 12; API in 6–8 |
| Auto-restore on verify | Task 3 (trigger), verified Task 14 |
| `auth.users` source of truth for created_at/identity | Tasks 3, 5 |
| Hourly cron, `CRON_SECRET`, `EMAIL_VERIFICATION_LAUNCH_DATE` env | Task 9, Global Constraints |
| Grandfather `max(created_at, LAUNCH_DATE)+5d` | Tasks 2, 3 |
| Audit events (all 6 + Email/Probe) | Tasks 3, 6–10, 14 |
| Idempotent, safe cron retries | Tasks 2, 9 |
| Tests (all 8 cases) | Task 2 (+ DB checks Task 14) |
| Single-use, hashed, expiring tokens | Tasks 5, 6, 7 |
| Email change invalidates tokens + deadline policy | Task 8 |
| No user enumeration | Tasks 6, 7, 8 |
| Rate limits by user + IP | Tasks 3 (table), 6 |
| Admin manual verify/restore (audited) | Task 10 |
| Admin view (status/deadline/reminders/suspension) | Tasks 10, 13 |
| Probe user auto-delete after tests + audit | Task 14 |

No placeholders remain; type names (`VerificationRow`, `account_can_write`, `dueReminderStage`, `stageBit`, `canResendUser`) are consistent across tasks.
