# Email/Phone OTP Verification Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force every registered user to verify their identity within 5 days via a 6-digit OTP sent to **email or phone** (verifying either one is enough), restricting (not deleting) unverified accounts past the deadline and auto-restoring them on verification.

**Architecture:** Application-level verification state in a `user_verification` table (Supabase `auth.users` stays the source of truth for `created_at` + identity). Email OTP is minted/hashed/expired by our own endpoints (Resend). Phone OTP uses Supabase native phone auth (Twilio); a server endpoint confirms `phone_confirmed_at` and stamps app-level state. Either channel sets `verified_at`. Post-deadline restriction is enforced primarily at the DB via an RLS helper `account_can_write()`, backed by API checks and frontend gating. An hourly, `CRON_SECRET`-secured cron sends staged reminders and flips accounts to `verification_overdue` — idempotently. Pure decision logic lives in a framework-free module, unit-tested with Vitest.

**Tech Stack:** Vite + React + TypeScript SPA, Supabase (Postgres + Auth + RLS + phone OTP), Vercel serverless functions (`@vercel/node`), Resend email, Vitest (new).

## Global Constraints

- **Verification signal is app-level `user_verification.verified_at`** (+ `verified_channel`) — NEVER `auth.users.email_confirmed_at` (auto-confirmed/meaningless here).
- **Two channels, either satisfies:** verifying email OR phone sets `verified_at` and lifts restriction.
- **Do not** change `mailer_autoconfirm`; **do not** hard-delete real accounts (restriction is reversible).
- **Email OTP:** 6-digit code via Resend; SHA-256 hashed at rest; 10-min expiry; single-use; max 5 attempts then invalidated.
- **Phone OTP:** Supabase native (`updateUser({ phone })` → SMS → `verifyOtp({ type:'phone_change' })`). **Prerequisite:** phone auth is currently disabled (`external.phone:false`); it must be enabled in the Supabase dashboard with Twilio creds (Task 0).
- Grace window: **5 days**. Deadline = `max(auth.users.created_at, LAUNCH_DATE) + 5 days`.
- `LAUNCH_DATE` single source = env `EMAIL_VERIFICATION_LAUNCH_DATE`; deploy seeds it into `public.verification_config`.
- Cron: hourly (`0 * * * *`), Bearer-authed with `CRON_SECRET`.
- Reminders: stages at (1) 2 days after signup, (2) <48h remaining, (3) <6h remaining; **max one per rolling 24h**; each stage once. Bitmask `reminders_sent` + `last_reminder_sent_at`.
- Rate limits: per-user (60s cooldown, ≤5 sends/24h) **and** per-IP (≤10/hour). Reuse `api/lib/ip-utils.ts`.
- Anti-enumeration: send/verify endpoints never reveal whether an email/phone/user exists; generic responses.
- All state changes idempotent; cron retries safe.
- Audit to `public.verification_events`: `VerificationOtpSent`, `VerificationReminderSent`, `VerificationDeadlineExpired`, `AccountRestricted`, `EmailVerified` (kept as the generic "verified" event, with `{channel}` metadata), `AccountRestored`, `EmailChanged`, `ProbeCleanup`.
- Restricted (`verification_overdue`|`suspended`) users MAY: sign in, view content, verify (email/phone), resend, change email/phone, edit limited profile fields (display_name, bio, avatar), logout, contact support. MUST NOT: post, comment, DM, like/follow/react, upload, or other sensitive business actions.
- Env vars: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `CRON_SECRET`, `EMAIL_VERIFICATION_LAUNCH_DATE`, `PUBLIC_APP_URL`.

---

## File Structure

**Create:**
- `supabase/add-email-verification.sql` — tables, config, trigger, backfill, `account_can_write()`, audit, RLS.
- `supabase/gate-write-policies-email-verification.sql` — gated write RLS.
- `supabase/admin-verification-rpcs.sql` — admin verify/restore RPCs.
- `api/lib/verification-state.ts` — pure decision logic.
- `api/lib/verification-db.ts` — service client + row helpers + OTP hashing + audit.
- `api/lib/verification-email.ts` — Resend OTP + reminder emails.
- `api/send-otp.ts` — authed: send email OTP (or advise phone channel), rate-limited, anti-enumeration.
- `api/verify-otp.ts` — authed: verify email OTP code → set `verified_at`.
- `api/confirm-phone.ts` — authed: confirm native phone verification → set `verified_at`.
- `api/change-email.ts` — change email, invalidate OTP, re-enter unverified flow.
- `api/cron/enforce-email-verification.ts` — hourly reminders + restriction.
- `api/admin/verification.ts` — admin list + manual verify/restore.
- `src/hooks/useVerification.ts` — state + send/verify (both channels).
- `src/components/VerifyEmailBanner.tsx` — countdown + resend.
- `src/components/RestrictionGuard.tsx` — restricted-user route allow-list.
- `src/pages/VerifyEmail.tsx` — channel picker + OTP entry (`/verify`).
- `src/components/admin/VerificationPanel.tsx` — admin view.
- `api/lib/__tests__/verification-state.test.ts` — Vitest.
- `vitest.config.ts`.

**Modify:**
- `src/context/AuthContext.tsx` — send OTP on register; expose nothing new beyond hook usage.
- `src/App.tsx` — mount banner, guard, `/verify` route.
- `src/pages/AdminDashboard.tsx` — mount verification panel.
- `vercel.json` — add `crons`.
- `package.json` — `test` script + `vitest`.

---

## Task 0: Prerequisite — enable Supabase phone auth (user action, documented)

**Files:** none (Supabase dashboard + Vercel env).

- [ ] **Step 1: Enable phone provider**

In Supabase Dashboard → Authentication → Providers → **Phone**: enable it, set SMS provider = Twilio, and fill Twilio `Account SID`, `Auth Token`, `Message Service SID` (or From number). Leave "Confirm phone" default. Do NOT enable phone autoconfirm.

- [ ] **Step 2: Confirm enablement**

Run:
```bash
node -e 'const f=require("fs");const e=Object.fromEntries(f.readFileSync(".env","utf8").split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1)]}));fetch(e.VITE_SUPABASE_URL.trim()+"/auth/v1/settings",{headers:{apikey:e.VITE_SUPABASE_ANON_KEY.trim()}}).then(r=>r.json()).then(j=>console.log("external.phone =",j.external.phone))'
```
Expected: `external.phone = true`. (If still false, phone OTP tasks 8b/frontend-phone remain stubbed — email OTP is fully functional regardless.)

- [ ] **Step 3: No commit** (dashboard change). Note completion in the PR description.

---

## Task 1: Test tooling (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:** Produces `npm test` running Vitest (node env).

- [ ] **Step 1: Add config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'] },
});
```

- [ ] **Step 2: Install + script**

Run: `npm install -D vitest`
Add to `package.json` `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Verify** — `npm test` → exits 0 ("No test files found").

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
  - `type Channel = 'email' | 'phone'`
  - `interface VerificationRow { created_at: string; verification_deadline: string; verified_at: string | null; verified_channel: Channel | null; account_status: AccountStatus; reminders_sent: number; last_reminder_sent_at: string | null; last_sent_at: string | null; send_count: number; otp_attempts: number; }`
  - `GRACE_MS`, `RESEND_COOLDOWN_MS=60_000`, `MAX_SENDS_PER_DAY=5`, `OTP_TTL_MS=600_000`, `MAX_OTP_ATTEMPTS=5`
  - `computeDeadline(createdAtIso, launchDateIso): string`
  - `remainingMs(nowIso, deadlineIso): number`
  - `isVerified(row): boolean`  // verified_at != null
  - `isRestricted(row): boolean`
  - `shouldRestrict(row, nowIso): boolean`
  - `dueReminderStage(row, nowIso): 0|1|2|3`
  - `canResendUser(row, nowIso): { ok: boolean; reason?: 'cooldown'|'rate_limit' }`
  - `stageBit(stage): number`
  - `generateOtp(): string` and `otpAttemptsExceeded(row): boolean`

- [ ] **Step 1: Write failing tests (all 8 required cases, OTP-aware)**

```ts
// api/lib/__tests__/verification-state.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeDeadline, remainingMs, isVerified, isRestricted, shouldRestrict,
  dueReminderStage, canResendUser, otpAttemptsExceeded, GRACE_MS,
} from '../verification-state';

const base = {
  created_at: '2026-07-25T00:00:00Z',
  verification_deadline: '2026-07-30T00:00:00Z',
  verified_at: null, verified_channel: null,
  account_status: 'active' as const,
  reminders_sent: 0, last_reminder_sent_at: null,
  last_sent_at: null, send_count: 0, otp_attempts: 0,
};

describe('deadline + grandfathering', () => {
  it('deadline = created_at + 5d when created after launch', () => {
    expect(computeDeadline('2026-07-25T00:00:00Z', '2026-01-01T00:00:00Z'))
      .toBe(new Date(Date.parse('2026-07-25T00:00:00Z') + GRACE_MS).toISOString());
  });
  it('grandfathers: deadline = launch + 5d when created before launch', () => {
    expect(computeDeadline('2026-01-01T00:00:00Z', '2026-07-25T00:00:00Z'))
      .toBe(new Date(Date.parse('2026-07-25T00:00:00Z') + GRACE_MS).toISOString());
  });
});

describe('newly registered unverified user (within grace)', () => {
  it('not restricted, positive remaining, no restrict', () => {
    const now = '2026-07-26T00:00:00Z';
    expect(isVerified(base)).toBe(false);
    expect(isRestricted(base)).toBe(false);
    expect(remainingMs(now, base.verification_deadline)).toBeGreaterThan(0);
    expect(shouldRestrict(base, now)).toBe(false);
  });
});

describe('verified user (either channel)', () => {
  it('phone-verified user never restricted/reminded', () => {
    const row = { ...base, verified_at: '2026-07-26T00:00:00Z', verified_channel: 'phone' as const };
    const now = '2026-08-10T00:00:00Z';
    expect(isVerified(row)).toBe(true);
    expect(shouldRestrict(row, now)).toBe(false);
    expect(dueReminderStage(row, now)).toBe(0);
  });
});

describe('user past deadline', () => {
  it('shouldRestrict true when active + unverified + past deadline', () => {
    expect(shouldRestrict(base, '2026-07-31T00:00:00Z')).toBe(true);
  });
  it('idempotent: false when already overdue', () => {
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
    expect(dueReminderStage(row, '2026-07-27T12:00:00Z')).toBe(0);
  });
  it('stage 2 due when <48h remain and 24h since last', () => {
    const row = { ...base, reminders_sent: 0b001, last_reminder_sent_at: '2026-07-27T01:00:00Z' };
    expect(dueReminderStage(row, '2026-07-28T06:00:00Z')).toBe(2);
  });
  it('never repeats a stage', () => {
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

describe('otp attempt lock', () => {
  it('locks after 5 wrong attempts', () => {
    expect(otpAttemptsExceeded({ ...base, otp_attempts: 5 })).toBe(true);
    expect(otpAttemptsExceeded({ ...base, otp_attempts: 4 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// api/lib/verification-state.ts
export type AccountStatus = 'active' | 'verification_overdue' | 'suspended';
export type Channel = 'email' | 'phone';

export interface VerificationRow {
  created_at: string;
  verification_deadline: string;
  verified_at: string | null;
  verified_channel: Channel | null;
  account_status: AccountStatus;
  reminders_sent: number;
  last_reminder_sent_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  otp_attempts: number;
}

export const GRACE_MS = 5 * 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60_000;
export const MAX_SENDS_PER_DAY = 5;
export const OTP_TTL_MS = 600_000;      // 10 minutes
export const MAX_OTP_ATTEMPTS = 5;
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
export function isVerified(row: VerificationRow): boolean { return row.verified_at != null; }
export function isRestricted(row: VerificationRow): boolean {
  return row.account_status === 'verification_overdue' || row.account_status === 'suspended';
}
export function shouldRestrict(row: VerificationRow, nowIso: string): boolean {
  return row.account_status === 'active' && !isVerified(row)
    && remainingMs(nowIso, row.verification_deadline) <= 0;
}
export function dueReminderStage(row: VerificationRow, nowIso: string): 0 | 1 | 2 | 3 {
  if (isVerified(row) || isRestricted(row)) return 0;
  const now = Date.parse(nowIso);
  if (row.last_reminder_sent_at && now - Date.parse(row.last_reminder_sent_at) < DAY_MS) return 0;
  const sinceSignup = now - Date.parse(row.created_at);
  const remain = Date.parse(row.verification_deadline) - now;
  const sent = row.reminders_sent;
  if (!(sent & 0b100) && remain <= H6 && remain > 0) return 3;
  if (!(sent & 0b010) && remain <= H48 && remain > 0) return 2;
  if (!(sent & 0b001) && sinceSignup >= 2 * DAY_MS && remain > 0) return 1;
  return 0;
}
export function canResendUser(row: VerificationRow, nowIso: string): { ok: boolean; reason?: 'cooldown' | 'rate_limit' } {
  const now = Date.parse(nowIso);
  if (row.last_sent_at && now - Date.parse(row.last_sent_at) < RESEND_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
  if (row.send_count >= MAX_SENDS_PER_DAY) return { ok: false, reason: 'rate_limit' };
  return { ok: true };
}
export function otpAttemptsExceeded(row: VerificationRow): boolean { return row.otp_attempts >= MAX_OTP_ATTEMPTS; }
export function stageBit(stage: 1 | 2 | 3): number { return 1 << (stage - 1); }
export function generateOtp(): string { return String(Math.floor(100000 + Math.random() * 900000)); }
```

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS.

- [ ] **Step 5: Commit**
```bash
git add api/lib/verification-state.ts api/lib/__tests__/verification-state.test.ts
git commit -m "feat: pure verification-state module (OTP, two-channel) with tests"
```

---

## Task 3: DB migration — tables, config, triggers, backfill, RLS helper

**Files:**
- Create: `supabase/add-email-verification.sql`

**Interfaces:** Produces DB objects: `user_verification`, `verification_events`, `verification_config`, `verification_rate_limits`, `account_can_write()`, `is_admin(uuid)`, `compute_verification_deadline()`, trigger `on_auth_user_created_verification`, trigger `trg_restore_on_verify`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/add-email-verification.sql — idempotent.

CREATE TABLE IF NOT EXISTS public.verification_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  launch_date timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.verification_config (id, launch_date)
VALUES (true, now()) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_verification (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  verification_deadline timestamptz NOT NULL,
  verified_at timestamptz,
  verified_channel text CHECK (verified_channel IN ('email','phone')),
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active','verification_overdue','suspended')),
  reminders_sent int NOT NULL DEFAULT 0,
  last_reminder_sent_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts int NOT NULL DEFAULT 0,
  otp_channel text CHECK (otp_channel IN ('email','phone')),
  last_sent_at timestamptz,
  send_count int NOT NULL DEFAULT 0,
  send_window_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_verification_status ON public.user_verification(account_status);
CREATE INDEX IF NOT EXISTS idx_user_verification_deadline ON public.user_verification(verification_deadline);
CREATE INDEX IF NOT EXISTS idx_user_verification_otp ON public.user_verification(otp_hash);

CREATE TABLE IF NOT EXISTS public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'VerificationOtpSent','VerificationReminderSent','VerificationDeadlineExpired',
    'AccountRestricted','EmailVerified','AccountRestored','EmailChanged','ProbeCleanup'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_events_user ON public.verification_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_rate_limits (
  ip_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.account_can_write()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT uv.account_status = 'active' FROM public.user_verification uv WHERE uv.user_id = auth.uid()),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.compute_verification_deadline(created timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT GREATEST(created, (SELECT launch_date FROM public.verification_config WHERE id)) + interval '5 days';
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_verification (user_id, email, phone, verification_deadline)
  VALUES (NEW.id, NEW.email, NEW.phone, public.compute_verification_deadline(NEW.created_at))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created_verification ON auth.users;
CREATE TRIGGER on_auth_user_created_verification
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_verification();

CREATE OR REPLACE FUNCTION public.restore_on_verify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL THEN
    NEW.account_status := 'active';
    NEW.suspended_at := NULL; NEW.suspension_reason := NULL;
    NEW.otp_hash := NULL; NEW.otp_expires_at := NULL; NEW.otp_attempts := 0;
    INSERT INTO public.verification_events(user_id, event_type, metadata)
    VALUES (NEW.user_id, 'EmailVerified', jsonb_build_object('channel', NEW.verified_channel)),
           (NEW.user_id, 'AccountRestored', jsonb_build_object('auto', true));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_restore_on_verify ON public.user_verification;
CREATE TRIGGER trg_restore_on_verify
  BEFORE UPDATE ON public.user_verification FOR EACH ROW EXECUTE FUNCTION public.restore_on_verify();

-- Grandfather existing users.
INSERT INTO public.user_verification (user_id, email, phone, verification_deadline)
SELECT u.id, u.email, u.phone, public.compute_verification_deadline(u.created_at)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_verification v WHERE v.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_verification ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own verification readable" ON public.user_verification;
CREATE POLICY "own verification readable" ON public.user_verification
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read verification events" ON public.verification_events;
CREATE POLICY "admins read verification events" ON public.verification_events
  FOR SELECT USING (public.is_admin(auth.uid()));
```

- [ ] **Step 2: Apply** in Supabase SQL editor. Verify `SELECT count(*) FROM public.user_verification` equals `auth.users` count.

- [ ] **Step 3: Manual verify** — new signup gets a row with deadline `max(created_at, launch_date)+5d`, `verified_at` null.

- [ ] **Step 4: Commit**
```bash
git add supabase/add-email-verification.sql
git commit -m "feat(db): user_verification (OTP two-channel) schema, triggers, backfill, RLS"
```

---

## Task 4: Gate write RLS policies with `account_can_write()`

**Files:** Create `supabase/gate-write-policies-email-verification.sql`
**Interfaces:** Consumes `account_can_write()`.

Identical to prior design (unchanged by OTP): DROP/recreate write policies on `posts`, `comments`, `messages`, `session_messages`, `follows`, `reactions`, `post_poll_votes`, `bookmarks`, and `storage.objects` uploads, each adding `AND public.account_can_write()` to `WITH CHECK`. SELECT policies untouched.

- [ ] **Step 1: Write the gating migration**

```sql
-- supabase/gate-write-policies-email-verification.sql
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_anyone" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
CREATE POLICY "posts_insert" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.account_can_write());
DROP POLICY IF EXISTS "posts_update" ON public.posts;
CREATE POLICY "posts_update" ON public.posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.account_can_write());

DROP POLICY IF EXISTS "comments_insert_anyone" ON public.comments;
DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());
DROP POLICY IF EXISTS "session_messages_insert" ON public.session_messages;
CREATE POLICY "session_messages_insert" ON public.session_messages FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

DROP POLICY IF EXISTS "follows_insert" ON public.follows;
CREATE POLICY "follows_insert" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

DROP POLICY IF EXISTS "reactions_insert" ON public.reactions;
CREATE POLICY "reactions_insert" ON public.reactions FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

DROP POLICY IF EXISTS "Users can vote once" ON public.post_poll_votes;
CREATE POLICY "Users can vote once" ON public.post_poll_votes FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

DROP POLICY IF EXISTS "Users can create own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can create own bookmarks" ON public.bookmarks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.account_can_write());

DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads (verified only)" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());
```

> Implementation note: `SELECT policyname FROM pg_policies WHERE tablename='<t>';` and `\d <t>` first to confirm exact policy names + `user_id`/`author_id` columns; adjust DROP names, keep the gate clause identical. Do not touch guest/anon insert policies (no `auth.uid()` → gate returns true).

- [ ] **Step 2: Apply + verify** — set a test user's row to `verification_overdue`; insert into `posts` as that user → RLS denies; set back to `active` → succeeds.

- [ ] **Step 3: Commit**
```bash
git add supabase/gate-write-policies-email-verification.sql
git commit -m "feat(db): gate write policies behind account_can_write()"
```

---

## Task 5: Service-role DB helper + OTP email sender

**Files:** Create `api/lib/verification-db.ts`, `api/lib/verification-email.ts`

**Interfaces:**
- `verification-db.ts`: `getServiceClient()`, `getVerification(userId)`, `updateVerification(userId, patch)`, `logEvent(userId, type, metadata?)`, `hashOtp(code)`, `launchDate()`.
- `verification-email.ts`: `sendOtpEmail(to, code)`, `sendReminderEmail(to, code, stage, remainingHours)` → `Promise<string|null>`.

- [ ] **Step 1: `verification-db.ts`**

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
export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
export async function getVerification(userId: string) {
  const { data, error } = await getServiceClient().from('user_verification').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error; return data;
}
export async function updateVerification(userId: string, patch: Record<string, unknown>) {
  const { error } = await getServiceClient().from('user_verification').update(patch).eq('user_id', userId);
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

- [ ] **Step 2: `verification-email.ts`** (OTP code style, from existing `send-verification.ts`)

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
const codeBox = (code: string) => `
  <div style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:40px;max-width:520px;margin:0 auto;">
    <h1 style="border-bottom:1px solid #22c55e;padding-bottom:16px;">Sin City Verification</h1>
    <p>Your verification code:</p>
    <div style="background:#1a1a1a;border:2px solid #22c55e;padding:20px;text-align:center;margin:20px 0;">
      <span style="font-size:32px;letter-spacing:8px;font-weight:bold;">${code}</span></div>
    <p style="font-size:13px;color:#888;">Expires in 10 minutes.</p>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #333;font-size:12px;color:#666;">Sin City</div>
  </div>`;

export function sendOtpEmail(to: string, code: string) {
  return send(to, 'Your Sin City verification code', codeBox(code));
}
export function sendReminderEmail(to: string, code: string, stage: number, remainingHours: number) {
  return send(to, `Verify soon — ~${Math.max(0, Math.round(remainingHours))}h left`, codeBox(code));
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**
```bash
git add api/lib/verification-db.ts api/lib/verification-email.ts
git commit -m "feat(api): verification DB helper + OTP email sender"
```

---

## Task 6: `send-otp` endpoint (email OTP; authed; rate-limited; anti-enumeration)

**Files:** Create `api/send-otp.ts`
**Interfaces:** Consumes `verification-db.ts`, `verification-state.ts`, `verification-email.ts`, `ip-utils.ts`. `POST /api/send-otp` `{ channel: 'email' }` + Bearer user token → generic `{ ok: true }`.

> Phone sending is done client-side via Supabase native `updateUser({ phone })` (Task 11), so this endpoint handles the `email` channel. A `phone` channel value returns generic `{ ok: true }` without action (native flow handles it).

- [ ] **Step 1: Implement**

```ts
// api/send-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification, logEvent, hashOtp } from './lib/verification-db';
import { canResendUser, generateOtp, OTP_TTL_MS } from './lib/verification-state';
import { sendOtpEmail } from './lib/verification-email';
import { getClientIp } from './lib/ip-utils';
import crypto from 'node:crypto';

const IP_LIMIT = 10;
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

  const generic = () => res.status(200).json({ ok: true });
  try {
    const channel = (req.body?.channel || 'email');
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return generic();
    const { data: { user } } = await getServiceClient().auth.getUser(token);
    if (!user) return generic();
    if (channel !== 'email') return generic(); // phone handled natively client-side

    const ipHash = crypto.createHash('sha256').update(getClientIp(req) || 'unknown').digest('hex');
    if (!(await ipAllowed(ipHash))) return generic();

    const row = await getVerification(user.id);
    if (!row || row.verified_at || !user.email) return generic();

    const nowIso = new Date().toISOString();
    let sendCount = row.send_count;
    if (!row.send_window_start || Date.now() - Date.parse(row.send_window_start) > 86400_000) sendCount = 0;
    if (!canResendUser({ ...row, send_count: sendCount }, nowIso).ok) return generic();

    const code = generateOtp();
    await updateVerification(user.id, {
      otp_hash: hashOtp(code),
      otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0,
      otp_channel: 'email',
      last_sent_at: nowIso,
      send_count: sendCount + 1,
      send_window_start: row.send_window_start && sendCount !== 0 ? row.send_window_start : nowIso,
      email: user.email,
    });
    const err = await sendOtpEmail(user.email, code);
    if (!err) await logEvent(user.id, 'VerificationOtpSent', { channel: 'email', ip_hash: ipHash });
    return generic();
  } catch (e) {
    console.error('[send-otp]', e);
    return res.status(200).json({ ok: true });
  }
}
```

- [ ] **Step 2: Confirm `getClientIp`** — `grep -n "export" api/lib/ip-utils.ts`; adjust import if name differs.

- [ ] **Step 3: Typecheck** — no errors.

- [ ] **Step 4: Commit**
```bash
git add api/send-otp.ts
git commit -m "feat(api): send-otp (email) with user+IP rate limits, anti-enumeration"
```

---

## Task 7: `verify-otp` endpoint (email OTP; single-use; attempt-limited)

**Files:** Create `api/verify-otp.ts`
**Interfaces:** Consumes `verification-db.ts`, `verification-state.ts`. `POST /api/verify-otp` `{ code }` + Bearer user token → `{ ok, verified }`. Sets `verified_at` (fires restore trigger).

- [ ] **Step 1: Implement**

```ts
// api/verify-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification, hashOtp } from './lib/verification-db';
import { otpAttemptsExceeded } from './lib/verification-state';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const fail = () => res.status(200).json({ ok: true, verified: false });
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const code = String(req.body?.code || '');
    if (!token || !/^\d{6}$/.test(code)) return fail();
    const { data: { user } } = await getServiceClient().auth.getUser(token);
    if (!user) return fail();

    const row = await getVerification(user.id);
    if (!row) return fail();
    if (row.verified_at) return res.status(200).json({ ok: true, verified: true }); // idempotent
    if (otpAttemptsExceeded(row)) return fail();
    if (!row.otp_hash || !row.otp_expires_at || Date.parse(row.otp_expires_at) < Date.now()) return fail();

    if (hashOtp(code) !== row.otp_hash) {
      await updateVerification(user.id, { otp_attempts: row.otp_attempts + 1 });
      return fail();
    }
    // success — single use; restore trigger clears otp + restores status
    await updateVerification(user.id, { verified_at: new Date().toISOString(), verified_channel: 'email' });
    return res.status(200).json({ ok: true, verified: true });
  } catch (e) {
    console.error('[verify-otp]', e);
    return res.status(200).json({ ok: true, verified: false });
  }
}
```

- [ ] **Step 2: Typecheck** — no errors.

- [ ] **Step 3: Commit**
```bash
git add api/verify-otp.ts
git commit -m "feat(api): verify-otp email code (single-use, attempt-limited)"
```

---

## Task 8: `confirm-phone` endpoint (native phone verification → app state)

**Files:** Create `api/confirm-phone.ts`
**Interfaces:** Consumes `verification-db.ts`. `POST /api/confirm-phone` + Bearer user token. Reads the caller's `auth.users` via admin; if `phone_confirmed_at` is set, stamps `verified_at`, `verified_channel='phone'`, and `phone`.

> Depends on Task 0 (phone auth enabled). The client runs the native `updateUser({ phone })` + `verifyOtp({ type:'phone_change' })` (Task 11); this endpoint is the trusted confirmation that writes app-level state.

- [ ] **Step 1: Implement**

```ts
// api/confirm-phone.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, getVerification, updateVerification } from './lib/verification-db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const generic = () => res.status(200).json({ ok: true, verified: false });
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return generic();
    const sb = getServiceClient();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return generic();

    // Trusted read of confirmed phone (client cannot forge this).
    const { data: adminUser } = await sb.auth.admin.getUserById(user.id);
    const confirmed = adminUser?.user?.phone_confirmed_at;
    const phone = adminUser?.user?.phone;
    if (!confirmed || !phone) return generic();

    const row = await getVerification(user.id);
    if (!row) return generic();
    if (row.verified_at) return res.status(200).json({ ok: true, verified: true });

    await updateVerification(user.id, { verified_at: new Date().toISOString(), verified_channel: 'phone', phone });
    return res.status(200).json({ ok: true, verified: true });
  } catch (e) {
    console.error('[confirm-phone]', e);
    return res.status(200).json({ ok: true, verified: false });
  }
}
```

- [ ] **Step 2: Typecheck** — no errors.

- [ ] **Step 3: Commit**
```bash
git add api/confirm-phone.ts
git commit -m "feat(api): confirm-phone stamps app-level verified state from native phone OTP"
```

---

## Task 9: `change-email` endpoint (invalidate OTP, re-enter unverified)

**Files:** Create `api/change-email.ts`
**Interfaces:** `POST /api/change-email` `{ new_email }` + Bearer token. Updates auth email, resets verification, retains deadline unless already verified (then `now+5d`), clears OTP, emits `EmailChanged`.

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
    if (!token || !new_email || !validEmail(new_email)) return res.status(200).json({ ok: true });
    const sb = getServiceClient();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return res.status(200).json({ ok: true });

    const row = await getVerification(user.id);
    const wasVerified = !!row?.verified_at;
    await sb.auth.admin.updateUserById(user.id, { email: new_email });

    const patch: Record<string, unknown> = {
      email: new_email, verified_at: null, verified_channel: null,
      otp_hash: null, otp_expires_at: null, otp_attempts: 0, otp_channel: null,
    };
    if (wasVerified) {
      patch.verification_deadline = new Date(Date.now() + GRACE_MS).toISOString();
      patch.account_status = 'active'; patch.suspended_at = null; patch.suspension_reason = null;
      patch.reminders_sent = 0; patch.last_reminder_sent_at = null;
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

- [ ] **Step 2: Typecheck** — no errors.

- [ ] **Step 3: Commit**
```bash
git add api/change-email.ts
git commit -m "feat(api): change-email invalidates OTP and re-enters verification"
```

---

## Task 10: Hourly cron — reminders + restriction (idempotent)

**Files:** Create `api/cron/enforce-email-verification.ts`; Modify `vercel.json`
**Interfaces:** `GET /api/cron/enforce-email-verification` (Bearer `CRON_SECRET`) → `{ reminded, restricted }`.

- [ ] **Step 1: Implement**

```ts
// api/cron/enforce-email-verification.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient, logEvent, hashOtp } from '../lib/verification-db';
import { dueReminderStage, stageBit, remainingMs, generateOtp, OTP_TTL_MS } from '../lib/verification-state';
import { sendReminderEmail } from '../lib/verification-email';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`)
    return res.status(401).json({ error: 'unauthorized' });

  const sb = getServiceClient();
  const nowIso = new Date().toISOString();
  let reminded = 0, restricted = 0;

  // Pass 1: restriction (idempotent via status='active').
  const { data: toRestrict } = await sb.from('user_verification')
    .update({ account_status: 'verification_overdue', suspended_at: nowIso, suspension_reason: 'not_verified' })
    .lt('verification_deadline', nowIso).is('verified_at', null).eq('account_status', 'active')
    .select('user_id');
  for (const r of toRestrict || []) {
    await logEvent(r.user_id, 'VerificationDeadlineExpired', {});
    await logEvent(r.user_id, 'AccountRestricted', { reason: 'not_verified' });
    restricted++;
  }

  // Pass 2: reminders (email channel; still in grace, unverified).
  const { data: candidates } = await sb.from('user_verification')
    .select('*').is('verified_at', null).eq('account_status', 'active');
  for (const row of candidates || []) {
    const stage = dueReminderStage(row, nowIso);
    if (stage === 0 || !row.email) continue;
    const code = generateOtp();
    await sb.from('user_verification').update({
      reminders_sent: row.reminders_sent | stageBit(stage as 1 | 2 | 3),
      last_reminder_sent_at: nowIso,
      otp_hash: hashOtp(code), otp_expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0, otp_channel: 'email',
    }).eq('user_id', row.user_id);
    const hours = Math.max(0, remainingMs(nowIso, row.verification_deadline) / 3600_000);
    const err = await sendReminderEmail(row.email, code, stage, hours);
    if (!err) { await logEvent(row.user_id, 'VerificationReminderSent', { stage, channel: 'email' }); reminded++; }
  }
  return res.status(200).json({ reminded, restricted });
}
```

- [ ] **Step 2: `vercel.json`** — add top-level `"crons": [{ "path": "/api/cron/enforce-email-verification", "schedule": "0 * * * *" }]` (keep `rewrites`).

- [ ] **Step 3: Idempotency check** — call the endpoint twice with the Bearer header; second call returns `{ "reminded": 0, "restricted": 0 }`; no header → 401.

- [ ] **Step 4: Commit**
```bash
git add api/cron/enforce-email-verification.ts vercel.json
git commit -m "feat(api): hourly cron for reminders + restriction (idempotent)"
```

---

## Task 11: Admin endpoint + RPCs — list, manual verify/restore (audited)

**Files:** Create `api/admin/verification.ts`, `supabase/admin-verification-rpcs.sql`
**Interfaces:** `GET /api/admin/verification` (list); `POST` `{ action:'verify'|'restore', target, reason }`. Admin JWT.

- [ ] **Step 1: RPCs (SQL)**

```sql
-- supabase/admin-verification-rpcs.sql
CREATE OR REPLACE FUNCTION public.admin_verify_user(target uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.user_verification
    SET verified_at = COALESCE(verified_at, now()),
        verified_channel = COALESCE(verified_channel, 'email')
  WHERE user_id = target;  -- restore trigger fires
  INSERT INTO public.verification_events(user_id, event_type, metadata)
  VALUES (target, 'AccountRestored', jsonb_build_object('by', auth.uid(), 'reason', reason, 'manual', true));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(target uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.user_verification
    SET account_status='active', suspended_at=NULL, suspension_reason=NULL WHERE user_id = target;
  INSERT INTO public.verification_events(user_id, event_type, metadata)
  VALUES (target, 'AccountRestored', jsonb_build_object('by', auth.uid(), 'reason', reason, 'manual', true));
END; $$;
```

- [ ] **Step 2: Admin API** — invoke RPCs with a **user-scoped** client (admin's JWT) so `auth.uid()` resolves for the `is_admin` guard.

```ts
// api/admin/verification.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '../lib/verification-db';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const anon = process.env.VITE_SUPABASE_ANON_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const svc = getServiceClient();
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return res.status(403).json({ error: 'forbidden' });
  const { data: prof } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (prof?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

  if (req.method === 'GET') {
    const { data: rows } = await svc.from('user_verification')
      .select('user_id, email, phone, account_status, verification_deadline, verified_at, verified_channel, reminders_sent, last_reminder_sent_at, suspended_at, suspension_reason')
      .order('verification_deadline', { ascending: true }).limit(500);
    return res.status(200).json({ rows: rows || [] });
  }
  if (req.method === 'POST') {
    const { action, target, reason } = req.body || {};
    if (!['verify', 'restore'].includes(action) || !target) return res.status(400).json({ error: 'bad request' });
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const fn = action === 'verify' ? 'admin_verify_user' : 'admin_restore_user';
    const { error } = await userClient.rpc(fn, { target, reason: reason || '' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 3: Apply SQL + typecheck** — no errors.

- [ ] **Step 4: Commit**
```bash
git add api/admin/verification.ts supabase/admin-verification-rpcs.sql
git commit -m "feat(api): admin verification list + manual verify/restore (audited)"
```

---

## Task 12: Frontend — verification hook + register wiring

**Files:** Create `src/hooks/useVerification.ts`; Modify `src/context/AuthContext.tsx`
**Interfaces:** `useVerification()` → `{ status, deadline, verifiedAt, verifiedChannel, loading, remainingMs, restricted, sendEmailOtp(), verifyEmailOtp(code), startPhone(phone), verifyPhoneOtp(phone, code), changeEmail(email), refresh() }`.

- [ ] **Step 1: Implement the hook**

```ts
// src/hooks/useVerification.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Status = 'active' | 'verification_overdue' | 'suspended';
interface State { status: Status; deadline: string | null; verifiedAt: string | null; verifiedChannel: string | null; loading: boolean; }

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function useVerification() {
  const [s, setS] = useState<State>({ status: 'active', deadline: null, verifiedAt: null, verifiedChannel: null, loading: true });

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setS(v => ({ ...v, loading: false })); return; }
    const { data } = await supabase.from('user_verification')
      .select('account_status, verification_deadline, verified_at, verified_channel').eq('user_id', user.id).maybeSingle();
    setS({
      status: (data?.account_status as Status) ?? 'active',
      deadline: data?.verification_deadline ?? null,
      verifiedAt: data?.verified_at ?? null,
      verifiedChannel: data?.verified_channel ?? null,
      loading: false,
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const post = async (path: string, body?: unknown) =>
    (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: body ? JSON.stringify(body) : undefined })).json().catch(() => ({}));

  const sendEmailOtp = useCallback(() => post('/api/send-otp', { channel: 'email' }), []);
  const verifyEmailOtp = useCallback(async (code: string) => { const r = await post('/api/verify-otp', { code }); await refresh(); return !!r.verified; }, [refresh]);

  // Phone: Supabase native. Attach + send SMS, then verify, then confirm app-state.
  const startPhone = useCallback(async (phone: string) => { const { error } = await supabase.auth.updateUser({ phone }); if (error) throw error; }, []);
  const verifyPhoneOtp = useCallback(async (phone: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'phone_change' });
    if (error) throw error;
    const r = await post('/api/confirm-phone'); await refresh(); return !!r.verified;
  }, [refresh]);

  const changeEmail = useCallback(async (new_email: string) => { await post('/api/change-email', { new_email }); await refresh(); }, [refresh]);

  const remaining = s.deadline ? Date.parse(s.deadline) - Date.now() : 0;
  return { ...s, remainingMs: remaining, restricted: s.status !== 'active' && !s.verifiedAt, sendEmailOtp, verifyEmailOtp, startPhone, verifyPhoneOtp, changeEmail, refresh };
}
```

- [ ] **Step 2: Send email OTP on register** — in `AuthContext.tsx` `register(...)`, after `setUser(mapped)` in the session branch:
```ts
try {
  await fetch('/api/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ channel: 'email' }) });
} catch { /* non-critical; banner + cron recover */ }
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no errors.

- [ ] **Step 4: Commit**
```bash
git add src/hooks/useVerification.ts src/context/AuthContext.tsx
git commit -m "feat(web): useVerification hook (email + phone OTP) + send on register"
```

---

## Task 13: Frontend — banner, verify page (channel picker + OTP), restriction guard

**Files:** Create `src/components/VerifyEmailBanner.tsx`, `src/pages/VerifyEmail.tsx`, `src/components/RestrictionGuard.tsx`; Modify `src/App.tsx`

- [ ] **Step 1: Banner (countdown + link to /verify)**

```tsx
// src/components/VerifyEmailBanner.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVerification } from '@/hooks/useVerification';

function fmt(ms: number) {
  if (ms <= 0) return '0h 0m';
  const h = Math.floor(ms / 3600_000), m = Math.floor((ms % 3600_000) / 60_000), d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${m}m`;
}
export default function VerifyEmailBanner() {
  const { verifiedAt, deadline, loading } = useVerification();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  if (loading || verifiedAt || !deadline) return null;
  const remaining = Date.parse(deadline) - now, overdue = remaining <= 0;
  return (
    <div className="w-full bg-black border-b border-green-700 text-green-400 font-mono text-sm px-4 py-2 flex items-center justify-between gap-3">
      <span>{overdue ? 'Your account is restricted until you verify.' : `Verify within ${fmt(remaining)} or your account will be restricted.`}</span>
      <Link to="/verify" className="border border-green-700 px-3 py-1 whitespace-nowrap">Verify now</Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify page — Email/Phone tabs + OTP input + resend cooldown**

```tsx
// src/pages/VerifyEmail.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVerification } from '@/hooks/useVerification';

export default function VerifyEmail() {
  const v = useVerification();
  const nav = useNavigate();
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [code, setCode] = useState(''); const [phone, setPhone] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null); const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown(c => c - 1), 1000); return () => clearInterval(t); }, [cooldown]);
  useEffect(() => { if (v.verifiedAt) nav('/'); }, [v.verifiedAt, nav]);

  const resendEmail = async () => { await v.sendEmailOtp(); setCooldown(60); setMsg('If eligible, a code was sent.'); };
  const submitEmail = async () => { setMsg(null); const ok = await v.verifyEmailOtp(code); setMsg(ok ? 'Verified!' : 'Invalid or expired code.'); };
  const sendPhone = async () => { setMsg(null); try { await v.startPhone(phone); setPhoneSent(true); setCooldown(60); setMsg('Code sent by SMS.'); } catch { setMsg('Could not send SMS.'); } };
  const submitPhone = async () => { setMsg(null); try { const ok = await v.verifyPhoneOtp(phone, code); setMsg(ok ? 'Verified!' : 'Invalid code.'); } catch { setMsg('Invalid code.'); } };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-mono text-green-400 p-4">
      <div className="border border-green-700 p-6 bg-black/70 max-w-md w-full">
        <div className="ascii-highlight mb-4 text-lg">+-- Verify your account --+</div>
        <div className="flex gap-2 mb-4">
          <button className={`border border-green-700 px-3 py-1 ${tab === 'email' ? 'bg-green-900/40' : ''}`} onClick={() => setTab('email')}>Email</button>
          <button className={`border border-green-700 px-3 py-1 ${tab === 'phone' ? 'bg-green-900/40' : ''}`} onClick={() => setTab('phone')}>Phone</button>
        </div>
        {tab === 'email' ? (
          <div className="space-y-3">
            <p className="text-xs ascii-dim">Enter the 6-digit code sent to your email.</p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="w-full bg-black border border-green-700 px-2 py-1 tracking-[8px] text-center" placeholder="000000" />
            <div className="flex gap-2">
              <button className="border border-green-700 px-3 py-1" onClick={submitEmail}>Verify</button>
              <button className="border border-green-700 px-3 py-1 disabled:opacity-50" disabled={cooldown > 0} onClick={resendEmail}>{cooldown > 0 ? `Resend (${cooldown}s)` : 'Send / resend code'}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs ascii-dim">Enter your phone in E.164 format (e.g. +15551234567).</p>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-black border border-green-700 px-2 py-1" placeholder="+15551234567" />
            {!phoneSent
              ? <button className="border border-green-700 px-3 py-1 disabled:opacity-50" disabled={cooldown > 0 || !phone} onClick={sendPhone}>{cooldown > 0 ? `Resend (${cooldown}s)` : 'Send SMS code'}</button>
              : <>
                  <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="w-full bg-black border border-green-700 px-2 py-1 tracking-[8px] text-center" placeholder="000000" />
                  <div className="flex gap-2">
                    <button className="border border-green-700 px-3 py-1" onClick={submitPhone}>Verify</button>
                    <button className="border border-green-700 px-3 py-1 disabled:opacity-50" disabled={cooldown > 0} onClick={sendPhone}>{cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend'}</button>
                  </div>
                </>}
          </div>
        )}
        {msg && <div className="mt-3 text-xs">{msg}</div>}
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
const ALLOW = ['/verify', '/support', '/contact'];
export default function RestrictionGuard({ children }: { children: React.ReactNode }) {
  const { restricted, loading } = useVerification();
  const loc = useLocation();
  if (loading) return <>{children}</>;
  if (restricted && !ALLOW.some(p => loc.pathname.startsWith(p))) return <Navigate to="/verify" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Wire `src/App.tsx`** — mount `<VerifyEmailBanner />` above routes, add `<Route path="/verify" element={<VerifyEmail />} />`, wrap authenticated subtree with `<RestrictionGuard>`. Follow existing router structure.

- [ ] **Step 5: Build** — `npm run build` → succeeds.

- [ ] **Step 6: Commit**
```bash
git add src/components/VerifyEmailBanner.tsx src/pages/VerifyEmail.tsx src/components/RestrictionGuard.tsx src/App.tsx
git commit -m "feat(web): verify page (email+phone OTP), banner, restriction guard"
```

---

## Task 14: Admin dashboard panel

**Files:** Create `src/components/admin/VerificationPanel.tsx`; Modify `src/pages/AdminDashboard.tsx`

- [ ] **Step 1: Panel**

```tsx
// src/components/admin/VerificationPanel.tsx
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
interface Row { user_id: string; email: string; phone: string | null; account_status: string; verification_deadline: string; verified_at: string | null; verified_channel: string | null; reminders_sent: number; last_reminder_sent_at: string | null; suspended_at: string | null; suspension_reason: string | null; }
async function hdr() { const { data: { session } } = await supabase.auth.getSession(); return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }; }
const stages = (m: number) => [1, 2, 3].filter(i => m & (1 << (i - 1))).join(',') || '—';
export default function VerificationPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = async () => { const r = await fetch('/api/admin/verification', { headers: await hdr() }); const b = await r.json().catch(() => ({ rows: [] })); setRows(b.rows || []); };
  useEffect(() => { load(); }, []);
  const act = async (target: string, action: 'verify' | 'restore') => { const reason = window.prompt(`Reason for ${action}?`) || ''; await fetch('/api/admin/verification', { method: 'POST', headers: await hdr(), body: JSON.stringify({ action, target, reason }) }); await load(); };
  return (
    <div className="font-mono text-green-400 text-xs overflow-x-auto">
      <table className="w-full border border-green-800">
        <thead><tr className="border-b border-green-800">
          <th className="text-left p-1">Email</th><th className="text-left p-1">Phone</th><th className="text-left p-1">Status</th>
          <th className="text-left p-1">Deadline</th><th className="text-left p-1">Verified</th><th className="text-left p-1">Reminders</th>
          <th className="text-left p-1">Suspended</th><th className="text-left p-1">Actions</th>
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.user_id} className="border-b border-green-900">
            <td className="p-1">{r.email}</td><td className="p-1">{r.phone ?? '—'}</td><td className="p-1">{r.account_status}</td>
            <td className="p-1">{new Date(r.verification_deadline).toLocaleString()}</td>
            <td className="p-1">{r.verified_at ? `✓ ${r.verified_channel ?? ''}` : '—'}</td>
            <td className="p-1">{stages(r.reminders_sent)}</td>
            <td className="p-1">{r.suspended_at ? (r.suspension_reason ?? 'yes') : '—'}</td>
            <td className="p-1"><button className="underline mr-2" onClick={() => act(r.user_id, 'verify')}>verify</button><button className="underline" onClick={() => act(r.user_id, 'restore')}>restore</button></td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Mount** `<VerificationPanel />` in `AdminDashboard.tsx` as a new section (follow existing section pattern).

- [ ] **Step 3: Build** — `npm run build` → succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/components/admin/VerificationPanel.tsx src/pages/AdminDashboard.tsx
git commit -m "feat(web): admin verification panel with manual verify/restore"
```

---

## Task 15: End-to-end validation + probe-user cleanup

- [ ] **Step 1: Email OTP happy path** — fresh signup → `user_verification` row `active`, deadline `now+5d`, `VerificationOtpSent` event → enter emailed code at `/verify` → `verified_at` set, `verified_channel='email'`, `EmailVerified`+`AccountRestored` events, banner gone.

- [ ] **Step 2: Phone OTP happy path** (requires Task 0) — on `/verify` Phone tab, enter E.164 phone → receive SMS → enter code → `verified_at` set, `verified_channel='phone'`.

- [ ] **Step 3: Restriction + auto-restore** — `UPDATE user_verification SET account_status='verification_overdue', verified_at=NULL, verification_deadline=now()-interval '1 day' WHERE user_id=<id>` → post insert denied by RLS, frontend redirects to `/verify` → verify (email or phone) → auto-restored, post insert succeeds.

- [ ] **Step 4: Cron idempotency** — run cron endpoint twice; second `0/0`; no duplicate reminder within 24h.

- [ ] **Step 5: Delete probe user + audit**

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
Expected: "deleted probe user …"; `ProbeCleanup` event persists (user_id set NULL on cascade).

- [ ] **Step 6: Full suite + build** — `npm test && npm run build` → all pass.

- [ ] **Step 7: Commit**
```bash
git commit -m "chore: verification flow validation + probe cleanup" --allow-empty
```

---

## Self-Review — spec coverage map

| Requirement | Task |
|---|---|
| Verify actual Supabase behavior first | Done pre-plan (spec); phone re-check Task 0 |
| App-level state (deadline, verified_at, status, reminders, suspended_at) | Task 3 |
| **OTP via email OR phone; either satisfies** | Tasks 6,7,8,12,13 |
| Grace access + banner + exact remaining time + resend cooldown/rate-limit | Tasks 6,12,13 |
| Post-deadline restriction at DB/API (allow/deny) | Tasks 4,13; APIs 6–8 |
| Auto-restore on verify | Task 3 (trigger); validated Task 15 |
| `auth.users` source of truth for created_at/identity/phone_confirmed_at | Tasks 3,8 |
| Hourly cron, CRON_SECRET, LAUNCH_DATE env | Task 10 |
| Grandfather max(created_at, LAUNCH_DATE)+5d | Tasks 2,3 |
| Audit events | Tasks 3,6–11,15 |
| Idempotent, safe retries | Tasks 2,10 |
| Tests (8 cases) | Task 2 (+ DB checks Task 15) |
| Single-use, hashed, expiring OTP + attempt lock | Tasks 5,6,7 |
| Email change invalidates OTP + deadline policy | Task 9 |
| No user enumeration | Tasks 6,7,8,9 |
| Rate limits user + IP | Tasks 3,6 |
| Admin manual verify/restore (audited) | Task 11 |
| Admin view (status/deadline/reminders/suspension) | Tasks 11,14 |
| Probe user auto-delete after tests + audit | Task 15 |
| Phone provider prerequisite | Task 0 |

No placeholders; type names (`VerificationRow`, `verified_at`, `verified_channel`, `account_can_write`, `dueReminderStage`, `otpAttemptsExceeded`, `generateOtp`) consistent across tasks.
