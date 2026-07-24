# Email Verification Enforcement — Design

**Date:** 2026-07-24
**Status:** Approved design (pending final spec review)

## Problem

Registered users currently get a full session at signup without ever proving they
control their email address. We must force verification within **5 days** of
registration. Unverified accounts past the deadline are **restricted** (soft
suspension), and are **automatically restored** the moment they verify.

## Verification findings (measured, not assumed)

Probed the live Supabase project before designing (per requirement: do not build on
assumptions). Results:

- `GET /auth/v1/settings` → **`mailer_autoconfirm: true`**.
- `POST /auth/v1/signup` (throwaway user) → **session returned immediately**,
  `email_confirmed_at` **stamped at signup**, `confirmation_sent_at` **absent**.

**Implications that shape this design:**

1. `auth.users.email_confirmed_at` is **auto-populated** and is therefore useless as
   a verification signal in this project. We do **not** use it to decide verified
   state.
2. Native Supabase confirmation emails are **not sent** at all, and enabling
   "Confirm email" would block login (no session) — incompatible with the
   "full access during the 5-day grace period" requirement.
3. Therefore verification is **application-level**: we send **our own** magic link
   (via the already-wired Resend integration) and track our own `email_verified_at`.
   `auth.users` remains the source of truth only for `created_at` and identity.

> Side effect of probing: one throwaway auto-confirmed user
> (`verify-probe+<n>@example.com`) exists in the project. Delete via dashboard or via
> the admin API once `SUPABASE_SERVICE_ROLE_KEY` is available locally.

## Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Verification delivery | **Magic link we control** → `/verify-email?token=…` |
| Suspension mechanism | **Application-level `account_status`** (NOT a Supabase ban) |
| Primary enforcement boundary | **Supabase RLS** + API checks + frontend gating |
| Grace access | Full access + persistent banner |
| Cron cadence | **Hourly**, secured by `CRON_SECRET` |
| `LAUNCH_DATE` | Env var `EMAIL_VERIFICATION_LAUNCH_DATE` (not hardcoded) |

## Data model

### New table: `public.user_verification` (one row per user)

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK → `auth.users(id)` ON DELETE CASCADE |
| `email` | text | Target address at row creation (denormalized) |
| `verification_deadline` | timestamptz | `max(auth.created_at, LAUNCH_DATE) + 5 days` |
| `email_verified_at` | timestamptz null | Set when the magic link is consumed |
| `account_status` | text | `active` \| `verification_overdue` \| `suspended`, default `active` |
| `verification_reminder_sent_at` | timestamptz null | Idempotency guard for reminder email |
| `suspended_at` | timestamptz null | When restriction began |
| `token_hash` | text null | SHA-256 of the current magic-link token |
| `token_expires_at` | timestamptz null | Link validity window (e.g. 24h) |
| `last_sent_at` | timestamptz null | Cooldown / resend rate limiting |
| `send_count` | int default 0 | Rate-limit window counter |
| `created_at` | timestamptz default now() | |

CHECK: `account_status IN ('active','verification_overdue','suspended')`.
RLS: user may `SELECT` **only their own** row; all writes are server-side
(service-role) or via SECURITY DEFINER RPCs. No client writes.

### New table: `public.verification_events` (audit)

`id`, `user_id`, `event_type`, `metadata jsonb`, `created_at`. `event_type` ∈
`VerificationEmailSent`, `VerificationReminderSent`, `VerificationDeadlineExpired`,
`AccountRestricted`, `EmailVerified`, `AccountRestored`. (Separate from the existing
`activity_logs` table, whose `action` CHECK enum is fixed and unrelated.)

## State machine

```
             register / grandfather
                     │  deadline = max(created_at, LAUNCH_DATE)+5d
                     ▼
                 ┌────────┐  verify (link)        ┌──────────┐
   within grace →│ active │──────────────────────▶│ verified │ (email_verified_at set,
                 └────────┘                        └──────────┘  status forced active)
                     │ now > deadline & unverified        ▲
                     ▼ (hourly cron)                       │ verify (link) → auto-restore
            ┌──────────────────────┐   verify (link)       │
            │ verification_overdue │──────────────────────┘
            └──────────────────────┘
                     │ (reserved: manual/admin escalation)
                     ▼
                ┌───────────┐
                │ suspended │  (same restricted enforcement as overdue)
                └───────────┘
```

- `active` = verified, **or** unverified but `now <= deadline`.
- `verification_overdue` = unverified and past deadline → **restricted**.
- `suspended` = terminal restricted state (admin/manual escalation); enforcement
  treats `verification_overdue` and `suspended` identically as "restricted".
- **Restricted** users may only: view/use the verify-email page, resend
  verification, logout, and support/contact. Everything else (posting, commenting,
  messaging, following, likes) is blocked.

## Components

### 1. DB migration (`supabase/add-email-verification.sql`)
- Create the two tables above + indexes (`account_status`, `verification_deadline`).
- `handle_new_user_verification()` trigger `AFTER INSERT ON auth.users` → inserts a
  `user_verification` row with `deadline = max(NEW.created_at, LAUNCH_DATE)+5d`.
  (LAUNCH_DATE read from a `verification_config` singleton row seeded by migration,
  since triggers can't read Vercel env.)
- **Grandfather backfill:** insert rows for all existing `auth.users` lacking one,
  `email_verified_at = NULL`, `deadline = max(created_at, LAUNCH_DATE)+5d`.
- `public.account_can_write()` — SECURITY DEFINER, returns boolean: `true` unless the
  caller's row is `verification_overdue`/`suspended`. Used in RLS.
- **RLS enforcement (primary boundary):** add `account_can_write()` to the
  `WITH CHECK` of write/INSERT/UPDATE policies on the user-write tables: `posts`,
  `comments`, `direct_messages` (and message tables), `follows`, likes/reactions.
  Enumerated precisely during implementation from existing `CREATE POLICY` statements.
- `restore_on_verify()` trigger on `user_verification`: when `email_verified_at`
  transitions NULL→NOT NULL, force `account_status='active'`, clear `suspended_at`
  and `verification_reminder_sent_at`, and insert `EmailVerified` + `AccountRestored`
  audit rows. Guarantees auto-restore regardless of path (requirement #6).

### 2. Pure decision module (`api/lib/verification-state.ts`)
Framework-free functions shared by cron + tests (so logic is unit-testable without a DB):
- `computeDeadline(createdAt, launchDate)` → timestamptz
- `isWithinGrace(now, deadline)` / `remainingMs(now, deadline)`
- `shouldSendReminder(row, now)` — deadline approaching (< 48h), not verified,
  `verification_reminder_sent_at` null.
- `shouldRestrict(row, now)` — unverified, `now > deadline`, status `active`.
- `canResend(row, now)` — cooldown (e.g. 60s) + rate limit (e.g. ≤5 / 24h).
All transitions are **pure + idempotent**: guards make repeat calls no-ops.

### 3. API endpoints (`api/`)
- `send-email-verification.ts` (authed): mints token, stores `token_hash` +
  `token_expires_at`, enforces `canResend`, sends Resend magic-link email, stamps
  `last_sent_at`/`send_count`, emits `VerificationEmailSent`.
- `verify-email.ts`: consumes `?token=`, validates hash + expiry, sets
  `email_verified_at=now` (trigger auto-restores + audits). Idempotent: already-
  verified → success no-op.
- `cron/enforce-email-verification.ts`: **hourly**. Bearer-checks `CRON_SECRET`.
  Uses service-role client. Two idempotent passes driven by SQL `UPDATE … WHERE …
  RETURNING`:
  1. **Reminders:** rows needing a reminder → send email, set
     `verification_reminder_sent_at`, emit `VerificationReminderSent`.
  2. **Restriction:** `UPDATE … SET account_status='verification_overdue',
     suspended_at=now WHERE account_status='active' AND email_verified_at IS NULL
     AND verification_deadline < now RETURNING` → emit `VerificationDeadlineExpired`
     + `AccountRestricted` only for returned rows. Re-running within the hour returns
     zero rows (safe retries, requirement #11).

### 4. Frontend
- `AuthContext` exposes `verification: { status, deadline, verifiedAt }`, plus
  `resendVerification()`; fetched from `user_verification` after auth, refreshed on
  `onAuthStateChange` and after returning from the verify link.
- `<VerifyEmailBanner>` — app-wide when logged in + unverified: **live countdown of
  exact remaining time**, Resend button (disabled during cooldown w/ countdown),
  session-dismiss (reappears next load).
- `<VerifyEmail>` page (`/verify-email`) — consumes the link token, shows success/
  failure, resend control.
- **Restricted-user routing:** a guard component; when `status ∈
  {verification_overdue, suspended}` all routes redirect to `/verify-email` except
  the allow-list (verify-email, resend, logout, support/contact). This is UX only —
  RLS is the real boundary (requirement #5).

## Configuration / env

| Var | Where | Purpose |
|---|---|---|
| `CRON_SECRET` | Vercel | Bearer auth on cron endpoint (new) |
| `EMAIL_VERIFICATION_LAUNCH_DATE` | Vercel (single source) | Grandfather floor; deploy step seeds it into `verification_config` so the DB trigger and cron never drift |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (existing) | Admin/service writes |
| `RESEND_API_KEY`, `FROM_EMAIL` | Vercel (existing) | Email delivery |
| `VITE_APP_URL` / origin | Build link URLs | |

`vercel.json` gains `"crons": [{ "path": "/api/cron/enforce-email-verification",
"schedule": "0 * * * *" }]`.

## Testing (Vitest — new dev dependency; no test runner exists today)

Pure-function tests against `verification-state.ts` covering the required cases:
1. newly registered unverified user (within grace, active, banner shown)
2. verified user (no banner, no restriction)
3. user within grace period (remaining time correct, not restricted)
4. user past deadline (shouldRestrict true → overdue)
5. existing-user grandfathering (`deadline = max(created_at, LAUNCH_DATE)+5d`)
6. resend cooldown + rate limit (`canResend` false during cooldown/over cap)
7. automatic restoration after verification (verify → status active, fields cleared)
8. repeated cron execution (idempotent: second pass transitions nobody, sends nothing)

DB-level behaviors (RLS block on restricted, trigger restore) documented as manual/
integration checks since no DB test harness exists; the decision logic they depend on
is unit-tested above.

## Amendments (approved 2026-07-24, post-design)

### A. Restriction scope (exact allow / deny)
**Overdue or suspended users MAY:** sign in; view existing content; open the
verify-email page; resend the verification link; **change their email address**; edit
a **limited set of non-sensitive profile fields** (display name, bio, avatar); log
out; contact support.
**They MUST NOT:** create/edit posts; create comments/replies; send direct messages;
like/follow/react or any social interaction; upload files/media; create requests or
other sensitive business actions.
Enforced at **DB (RLS) + API**, not only frontend. The `account_can_write()` helper
gates all deny-list tables. Email-change and the whitelisted profile fields are
explicitly exempted from the gate.

### B. Reminder schedule (replaces the single-reminder model)
Send reminders at three triggers: **(1)** 2 days after signup; **(2)** < 48h
remaining; **(3)** < 6h remaining. **Never more than one reminder per rolling 24h.**
Data-model change: replace `verification_reminder_sent_at` with:
- `reminders_sent` `int` bitmask (bit0=stage1, bit1=stage2, bit2=stage3), default 0.
- `last_reminder_sent_at` `timestamptz null` — enforces the 24h floor.
Each stage fires once (bit guard) **and** only if `now - last_reminder_sent_at >= 24h`.
Fully idempotent; emits `VerificationReminderSent` with `{stage}` metadata.

### C. Tokens (hardening)
Verification tokens are **single-use** (cleared/marked consumed on first success),
**hashed at rest** (SHA-256; raw token only in the emailed URL), and **expire**
(`token_expires_at`, default 24h). Verifying or re-sending replaces any prior token.

### D. Email change
Changing email **invalidates all existing tokens** (null `token_hash`/`token_expires_at`),
sets `email_verified_at = NULL`, updates `email`, and re-enters the unverified flow.
**Deadline policy:** the original `verification_deadline` is **retained** (changing
email does not buy a fresh 5-day window) unless the account was already restored/
verified, in which case a new deadline of `now + 5d` is issued. Emits an audit event.

### E. Endpoint hygiene / anti-enumeration
`send-email-verification` and `verify-email` **never reveal whether an email/account
exists**. Resend always returns a generic "if eligible, a link was sent" response;
verify returns generic success/failure without distinguishing "no such user" from
"bad token". Timing kept uniform where practical.

### F. Rate limiting (user + IP)
Resend/verify are rate-limited on **both** dimensions:
- Per user: cooldown 60s; ≤ 5 sends / 24h (existing `last_sent_at`/`send_count`).
- Per IP: sliding window (e.g. ≤ 10 verification-email requests / hour / IP), stored
  in a small `verification_rate_limits` table keyed by `ip_hash` (reuses
  `api/lib/ip-utils.ts`). Exceeding either returns the same generic throttled response.

### G. Admin: manual verify / restore (fully audited)
Service-role/admin RPC `admin_verify_user(target uuid, reason text)` and
`admin_restore_user(target uuid, reason text)`: set `email_verified_at`/`account_status
= active`, clear suspension fields, and write `EmailVerified` / `AccountRestored`
audit rows tagged `{by: <admin_id>, reason, manual: true}`. Guarded by an
`is_admin(auth.uid())` check.

### H. Admin view
Admin dashboard panel listing, per user: verification status, `verification_deadline`,
remaining time, reminder history (stages + timestamps from `reminders_sent` /
`verification_events`), and suspension reason/`suspended_at`. Read-only + the two
manual actions from (G).

### I. Probe user lifecycle
Keep the throwaway probe user during implementation for flow validation. After the
verification-flow tests pass, an implementation step deletes it via the admin API and
records the deletion in `verification_events` (`event_type` metadata `{probe_cleanup:
true}`).

## Out of scope (YAGNI)

- Self-service recovery for the terminal `suspended` state (admin restores).
- Changing the Supabase `mailer_autoconfirm` setting.
- Hard-deleting accounts (we suspend, reversibly).
