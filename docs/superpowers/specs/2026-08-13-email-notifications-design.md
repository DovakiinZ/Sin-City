# Design: Coalesced Email Notifications via Resend

- **Date:** 2026-08-13
- **Status:** Approved (pending spec review)
- **Scope:** Send delayed, coalesced email notifications for DMs, likes/reactions, comments/replies, and follows/mentions.

## 1. Goal

When a user receives activity (a DM, like, comment, reply, follow request, follow
approval, or mention) while they are not actively reading it, send them **one**
summary email covering everything they have not yet read. Emails are gated by a
single global per-user toggle and always carry a one-click unsubscribe link.

Non-goals:

- Per-type preference toggles (explicitly rejected: single global toggle).
- Instant per-event emails (rejected: delayed + coalesced only).
- Push notifications, SMS, or any channel other than email.

## 2. Key decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Which interactions email | DMs, likes/reactions, comments/replies, follows & mentions |
| Timing | Delayed + coalesced (one email per delay window) |
| Preference granularity | Single global toggle (`email_enabled`) + delay |
| Architecture | Unified queue driven by the `notifications` table |
| Coalescing scope | One combined email per user |
| Follow-request/mention wiring | Wire up now so they create `notifications` rows |

## 3. Current state (baseline)

- **Stack:** Vite + React SPA, Supabase (Postgres + Auth), serverless functions in
  `/api` on Vercel.
- **Resend helper:** `lib/verification-email.ts` exports
  `send(to, subject, html): Promise<string | null>` (Resend HTTP API, uses
  `RESEND_API_KEY` and `FROM_EMAIL`). Returns `null` on success or an error string.
- **Notifications table:** `supabase/notifications-setup.sql` — columns
  `id, user_id, type, content JSONB, read, created_at`. `type` CHECK includes
  `comment, reaction, follow, mention, reply, message, dm, dm_message,
  follow_request, follow_approved`.
- **Rows already created for:** `reaction` (`src/hooks/useReactions.ts`),
  `comment` (SQL trigger `notify_on_comment`), `follow_approved` (RPC
  `respond_to_follow_request`), `dm_message` (`src/lib/dmNotifications.ts`).
- **NOT reliably created yet:** `follow_request`, `mention`.
- **Half-built DM email path (to be retired):** `supabase/dm-email-notifications.sql`
  defines `dm_email_queue`, `dm_notification_settings`, and triggers on
  `session_messages` — but no worker ever sends them.
- **Cron:** `/api/verification?action=cron` guarded by `CRON_SECRET`, invoked by an
  external caller (no `crons` block in `vercel.json`).
- **Email address source:** `auth.users.email` via the Supabase service client
  (`getServiceClient()` in `lib/verification-db.ts`). `profiles` has no email column.

## 4. Data model

### 4.1 `notification_email_settings`

Create a new `notification_email_settings` table (do **not** edit the historical
`dm-email-notifications.sql`); migrate rows from `dm_notification_settings`, then
drop the old table in the same migration. Final shape:

```sql
CREATE TABLE public.notification_email_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled     BOOLEAN NOT NULL DEFAULT true,          -- single global toggle
  delay_minutes     INTEGER NOT NULL DEFAULT 5
                    CHECK (delay_minutes IN (5, 15, 30, 60)),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),-- login-free unsubscribe
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Migrate existing `dm_notification_settings` rows (`user_id, email_enabled,
  delay_minutes`) into this table; backfill `unsubscribe_token`.
- RLS: a user may `SELECT`/`INSERT`/`UPDATE` their own row. `unsubscribe_token` is
  only ever read by the service role (unsubscribe endpoint).
- A `helper get_notification_email_settings(user_id)` returns
  `(email_enabled, delay_minutes)`, defaulting to `(true, 5)` when no row exists so
  users without a settings row still receive email.

### 4.2 `notification_email_queue`

Generalizes `dm_email_queue`.

```sql
CREATE TABLE public.notification_email_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'cancelled')),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one pending email per user -> this is the coalescing mechanism.
CREATE UNIQUE INDEX idx_notification_email_queue_pending
  ON public.notification_email_queue (user_id) WHERE status = 'pending';

CREATE INDEX idx_notification_email_queue_due
  ON public.notification_email_queue (scheduled_at) WHERE status = 'pending';
```

RLS: only the service role manages this table.

### 4.3 Retire the DM-specific path

Drop `dm_email_queue`, `dm_notification_settings` (after migration), the
`session_messages` queue/cancel triggers, and their helper functions defined in
`supabase/dm-email-notifications.sql`. Deliver this as a new migration rather than
editing the historical file.

## 5. Flow

### 5.1 Enqueue (DB trigger)

`AFTER INSERT ON public.notifications` fires `enqueue_notification_email()`
(`SECURITY DEFINER`):

1. Look up the recipient's settings (`get_notification_email_settings(NEW.user_id)`).
2. If `email_enabled` is false, return (no email).
3. `INSERT INTO notification_email_queue (user_id, scheduled_at)`
   `VALUES (NEW.user_id, now() + (delay_minutes || ' minutes')::interval)`
   `ON CONFLICT (user_id) WHERE status='pending' DO NOTHING`.

The `ON CONFLICT DO NOTHING` against the unique partial index means a burst of
notifications produces exactly one pending queue row scheduled off the **first**
event in the window. This is the coalescing guarantee.

### 5.2 Send (cron worker)

New endpoint `/api/notifications-cron` (mirror `api/verification.ts` cron action:
require `Authorization: Bearer ${CRON_SECRET}`). On each run:

1. Select pending entries where `scheduled_at <= now()` (bounded batch, e.g. 200).
2. For each entry:
   a. Load the user's **unread** notifications
      (`SELECT ... FROM notifications WHERE user_id = $1 AND read = false
      ORDER BY created_at DESC LIMIT 50`).
   b. Re-check `email_enabled` (user may have opted out during the delay). If false
      or there are **zero** unread notifications, mark the entry `sent` and skip —
      this transparently handles "user already read everything / is online."
   c. Resolve the recipient email from `auth.users` via the service client.
   d. Render one summary email (see §6) and call
      `send(email, subject, html)` from `lib/verification-email.ts`.
   e. On success mark `status='sent', sent_at=now()`. On failure, log and leave the
      entry `pending` for the next run (bounded retry — see §8).

No read-time cancellation trigger is required; the unread check at send time is the
source of truth. (Optional optimization deferred: cancel the pending entry when a
user reads everything, to save a wasted cron pass.)

### 5.3 Unsubscribe

`GET /api/notifications-cron?action=unsubscribe&token=<uuid>` (or a dedicated
`/api/unsubscribe`): look up `notification_email_settings` by `unsubscribe_token`,
set `email_enabled=false`, return a small confirmation HTML page. No auth required.
The same URL is placed in the `List-Unsubscribe` header and the email footer.

## 6. Email rendering

One combined email per user, grouped by type with counts, e.g.:

> **You have new activity on Sin City**
> - 💬 2 new messages from @alice, @bob
> - 👍 3 people liked your posts
> - 💬 1 new comment on "Post title"
> - 👥 1 new follow request

- Subject reflects the dominant/aggregate activity, e.g. `You have 7 new
  notifications on Sin City` (fallback when mixed).
- Reuse the existing dark/monospace Sin City template styling from
  `api/send-verification.ts` for visual consistency.
- Body links back to the app (notifications view / relevant thread where a single
  source dominates).
- Footer: unsubscribe link. Headers: `List-Unsubscribe: <unsubscribe URL>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.

A pure render helper `renderActivityEmail(notifications): { subject, html }` lives in
`lib/notification-email.ts` so it is unit-testable without network or DB.

## 7. Prerequisites to close (wiring gaps)

1. **Follow requests:** ensure the request path (SQL RPC / app code that creates a
   `follows` row with `status='pending'`) also inserts a `notifications` row of type
   `follow_request` for the target user. Mirror the `follow_approved` pattern in
   `supabase/follow-requests-and-dm-gate.sql`.
2. **Mentions:** when a post/comment contains `@username`, insert a `mention`
   notification for each mentioned, existing user. Minimal parser in the
   comment/post creation path (app code or SQL trigger, following the existing
   `notify_on_comment` style).
3. **Deliverability:** `FROM_EMAIL` must use a Resend-verified domain in production
   (`onboarding@resend.dev` is test-only). Documented as an env prerequisite, not a
   code change.

## 8. Error handling & edge cases

- **Resend failure:** entry stays `pending`; retried next cron run. Add a
  `created_at`-based backstop: if an entry is older than N hours and still pending,
  mark `cancelled` to avoid infinite retry of a permanently-bad address.
- **User with no email / unconfirmed:** skip and mark `sent` (nothing to send).
- **Deleted user:** `ON DELETE CASCADE` removes queue/settings rows.
- **Notification read between enqueue and send:** unread check yields fewer/zero
  rows; email reflects only what is still unread, or is skipped.
- **Clock/cron gaps:** selection is `scheduled_at <= now()`, so a late cron simply
  sends slightly later; nothing is lost.
- **Opt-out during delay:** re-checked at send time.

## 9. Cron cadence

- Preferred: add a `crons` entry to `vercel.json`:
  `{ "path": "/api/notifications-cron", "schedule": "*/5 * * * *" }`.
- Constraint: Vercel Hobby allows only daily crons. If the project is on Hobby,
  fall back to (a) the existing external cron caller hitting the endpoint every
  5 min, or (b) Supabase `pg_cron` + `pg_net` invoking the endpoint.
- The chosen delay values (5/15/30/60) assume ~5-min cron granularity; a 5-min
  delay may fire up to one cron interval late, which is acceptable.

## 10. Testing strategy

**SQL (pgTAP or scripted):**
- Rapid multi-insert of notifications for one user → exactly one pending queue row.
- `email_enabled=false` → no queue row created.
- `get_notification_email_settings` defaults to `(true, 5)` with no row.

**Worker (`/api/notifications-cron`):**
- Due-entry selection respects `scheduled_at`.
- Only unread notifications are included.
- All-read or zero-unread → entry marked `sent`, no email sent.
- `email_enabled` flipped false during delay → suppressed.
- Resend failure → entry remains pending; aged entry → cancelled.
- Unsubscribe token flips `email_enabled=false` and is idempotent.

**Render (`renderActivityEmail`):**
- Correct grouping and counts for mixed types.
- Valid unsubscribe URL present in body and header.

## 11. Files touched (anticipated)

- `supabase/2026-08-13-notification-email-queue.sql` (new migration: settings table,
  queue table, enqueue trigger, helpers; drops DM-specific objects).
- `supabase/follow-requests-and-dm-gate.sql` / related: add `follow_request`
  notification insert.
- Mention-notification wiring (post/comment creation path).
- `api/notifications-cron.ts` (new: cron worker + unsubscribe action).
- `lib/notification-email.ts` (new: `renderActivityEmail`).
- `src/components/settings/DMNotificationSettings.tsx` → generalized settings UI
  ("Email me about activity" toggle + delay).
- `vercel.json` (add `crons` entry, if on a supporting plan).
- `.env.example` / docs: confirm `RESEND_API_KEY`, `FROM_EMAIL`, `CRON_SECRET`.

## 12. Rollout

1. Ship migration (creates new tables, retires DM queue, migrates settings).
2. Deploy `renderActivityEmail` + `/api/notifications-cron` (idempotent, safe before
   cron is enabled).
3. Wire follow-request/mention notification creation.
4. Update settings UI + unsubscribe route.
5. Enable cron (vercel.json or external caller).
6. Verify with a test account across all interaction types.
