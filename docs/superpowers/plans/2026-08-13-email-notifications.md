# Email Notifications (Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send delayed, coalesced email notifications via Resend for DMs, likes/reactions, comments/replies, and follows/mentions — one summary email per user per delay window, gated by a single global toggle with one-click unsubscribe.

**Architecture:** A DB trigger on `public.notifications` enqueues at most one *pending* row per user in a new `notification_email_queue` (scheduled `now() + delay`). A Vercel cron endpoint (`/api/notifications-cron`) drains due entries, gathers each user's still-unread notifications, renders one summary email with a pure helper, and sends it through the existing `lib/verification-email.ts` `send()` helper. The half-built `dm_email_queue` path is retired. Follow-request and mention notification rows (currently missing) are wired up so the trigger covers them.

**Tech Stack:** Vite + React SPA (TS), Supabase (Postgres + Auth), Vercel serverless functions in `/api` (`@vercel/node`), Resend HTTP API, Vitest for unit tests.

## Global Constraints

- Reuse the existing Resend helper `send(to, subject, html): Promise<string | null>` from `lib/verification-email.ts` (returns `null` on success, error string on failure). Do NOT add a new Resend client.
- Server-side DB access uses `getServiceClient()` from `lib/verification-db.ts` (Supabase service role).
- Cron/authenticated backend endpoints authorize with header `Authorization: Bearer ${process.env.CRON_SECRET}` (mirror `api/verification.ts` cron action).
- API files are `.ts` under `/api`, compiled via `tsconfig.api.json`; import local libs with the `.js` extension in the specifier (e.g. `from '../lib/verification-email.js'`), matching `api/verification.ts`.
- SQL migrations are idempotent, live in `supabase/`, and are hand-run in the Supabase SQL editor. Never edit historical migration files; add new ones.
- `notifications.type` CHECK already allows `comment, reaction, like, follow, mention, reply, message, dm, dm_message, follow_request, follow_approved` (set in `supabase/follow-requests-and-dm-gate.sql`). Do not narrow it.
- Delay values are restricted to `{5, 15, 30, 60}` minutes; default 5.
- Every email MUST contain an unsubscribe link and a `List-Unsubscribe` header pointing at the unsubscribe endpoint.
- Tests run with `npm run test` (`vitest run`); test files live in `tests/` named `*.test.ts`.
- Absolute URLs in emails use `process.env.APP_URL` (e.g. `https://cicada.city`).

---

### Task 1: Core email queue migration (settings + queue + enqueue trigger + retire DM path)

Creates the settings and queue tables, the settings helper, the enqueue trigger on `notifications`, and drops the obsolete DM-email objects. This is one SQL file applied atomically.

**Files:**
- Create: `supabase/2026-08-13-notification-email-queue.sql`

**Interfaces:**
- Produces (SQL objects later tasks rely on):
  - Table `public.notification_email_settings(user_id UUID PK, email_enabled BOOLEAN, delay_minutes INT, unsubscribe_token UUID, created_at, updated_at)`.
  - Table `public.notification_email_queue(id UUID PK, user_id UUID, scheduled_at TIMESTAMPTZ, status TEXT, sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ)` with a partial unique index on `(user_id) WHERE status='pending'`.
  - Function `public.get_notification_email_settings(p_user_id UUID) RETURNS TABLE(email_enabled BOOLEAN, delay_minutes INTEGER)` — ensures a settings row exists, then returns it.
  - Trigger `on_notification_enqueue_email AFTER INSERT ON public.notifications`.

- [ ] **Step 1: Write the migration file**

Create `supabase/2026-08-13-notification-email-queue.sql`:

```sql
-- ============================================================================
-- UNIFIED EMAIL NOTIFICATIONS: settings + queue + enqueue trigger
-- Replaces the half-built dm_email_queue path. Idempotent; safe to re-run.
-- ============================================================================

-- 1. SETTINGS ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_email_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled     BOOLEAN NOT NULL DEFAULT true,
  delay_minutes     INTEGER NOT NULL DEFAULT 5 CHECK (delay_minutes IN (5, 15, 30, 60)),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_email_settings_token
  ON public.notification_email_settings(unsubscribe_token);

ALTER TABLE public.notification_email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own email settings select" ON public.notification_email_settings;
CREATE POLICY "own email settings select" ON public.notification_email_settings
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own email settings insert" ON public.notification_email_settings;
CREATE POLICY "own email settings insert" ON public.notification_email_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own email settings update" ON public.notification_email_settings;
CREATE POLICY "own email settings update" ON public.notification_email_settings
  FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_email_settings TO authenticated;

-- Migrate any existing DM settings, then the old table is dropped in section 5.
DO $$
BEGIN
  IF to_regclass('public.dm_notification_settings') IS NOT NULL THEN
    INSERT INTO public.notification_email_settings (user_id, email_enabled, delay_minutes)
    SELECT user_id, email_enabled, delay_minutes FROM public.dm_notification_settings
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- Ensure-and-read helper. Guarantees every user who gets a notification has a
-- settings row (hence an unsubscribe_token) by the time an email is scheduled.
CREATE OR REPLACE FUNCTION public.get_notification_email_settings(p_user_id UUID)
RETURNS TABLE (email_enabled BOOLEAN, delay_minutes INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_email_settings (user_id)
  VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  RETURN QUERY
  SELECT s.email_enabled, s.delay_minutes
  FROM public.notification_email_settings s WHERE s.user_id = p_user_id;
END; $$;

-- 2. QUEUE ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_email_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one pending email per user -> coalescing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_email_queue_pending
  ON public.notification_email_queue(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_email_queue_due
  ON public.notification_email_queue(scheduled_at) WHERE status = 'pending';

ALTER TABLE public.notification_email_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service manages email queue" ON public.notification_email_queue;
CREATE POLICY "service manages email queue" ON public.notification_email_queue
  FOR ALL USING (auth.role() = 'service_role');

-- 3. ENQUEUE TRIGGER --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings RECORD;
  v_scheduled TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_settings FROM public.get_notification_email_settings(NEW.user_id);
  IF NOT v_settings.email_enabled THEN
    RETURN NEW;
  END IF;
  v_scheduled := now() + (v_settings.delay_minutes || ' minutes')::interval;
  INSERT INTO public.notification_email_queue (user_id, scheduled_at)
  VALUES (NEW.user_id, v_scheduled)
  ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_notification_enqueue_email ON public.notifications;
CREATE TRIGGER on_notification_enqueue_email
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_email();

-- 4. RETIRE the half-built DM email path -----------------------------------
DROP TRIGGER IF EXISTS on_new_dm_queue_email ON public.session_messages;
DROP TRIGGER IF EXISTS on_read_cancel_email ON public.session_read_status;
DROP FUNCTION IF EXISTS public.trigger_queue_dm_notification() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_cancel_dm_emails() CASCADE;
DROP FUNCTION IF EXISTS public.queue_dm_notification(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_pending_dm_emails(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_notification_settings(UUID);
DROP TABLE IF EXISTS public.dm_email_queue;

-- 5. Drop old settings table AFTER migration above.
DROP TABLE IF EXISTS public.dm_notification_settings;

DO $$ BEGIN RAISE NOTICE '✅ notification_email_settings + notification_email_queue installed'; END $$;
```

- [ ] **Step 2: Apply the migration in the Supabase SQL editor**

Paste the whole file into the Supabase SQL editor and run it. Expected: `NOTICE: ✅ notification_email_settings + notification_email_queue installed`, no errors.

- [ ] **Step 3: Verify coalescing (test)**

Run this in the SQL editor (replace `<UID>` with a real `auth.users.id`):

```sql
-- clean slate for the test user
DELETE FROM public.notification_email_queue WHERE user_id = '<UID>';
-- two rapid notifications should collapse to ONE pending queue row
INSERT INTO public.notifications (user_id, type, content)
VALUES ('<UID>', 'reaction', '{"author":"t1"}'), ('<UID>', 'comment', '{"author":"t2"}');
SELECT count(*) AS pending FROM public.notification_email_queue
WHERE user_id = '<UID>' AND status = 'pending';
```

Expected: `pending = 1`.

- [ ] **Step 4: Verify opt-out suppresses enqueue (test)**

```sql
UPDATE public.notification_email_settings SET email_enabled = false WHERE user_id = '<UID>';
DELETE FROM public.notification_email_queue WHERE user_id = '<UID>';
INSERT INTO public.notifications (user_id, type, content) VALUES ('<UID>', 'reaction', '{"author":"t3"}');
SELECT count(*) AS pending FROM public.notification_email_queue
WHERE user_id = '<UID>' AND status = 'pending';
-- cleanup
UPDATE public.notification_email_settings SET email_enabled = true WHERE user_id = '<UID>';
DELETE FROM public.notifications WHERE user_id = '<UID>' AND content->>'author' IN ('t1','t2','t3');
DELETE FROM public.notification_email_queue WHERE user_id = '<UID>';
```

Expected: `pending = 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/2026-08-13-notification-email-queue.sql
git commit -m "feat(email): unified notification email queue + enqueue trigger"
```

---

### Task 2: Wire up follow-request and mention notifications

Follow requests are plain client inserts into `follows` (status `pending`) and create no notification today; mentions create none. Add DB triggers so both produce `notifications` rows — which the Task 1 trigger then emails.

**Files:**
- Create: `supabase/2026-08-13-follow-request-and-mention-notifications.sql`

**Interfaces:**
- Consumes: `public.notifications` table; `public.follows(follower_id, following_id, status)`; `public.comments(id, post_id, user_id, author_name, content)`; `public.posts(id, user_id, title, slug, content)`; `public.profiles(id, username)`.
- Produces: triggers `on_follow_request_notify` (on `follows`), `on_comment_mention` (on `comments`), `on_post_mention` (on `posts`); helper `public.create_mention_notifications(text, uuid, text, jsonb)`.

- [ ] **Step 1: Write the wiring migration file**

Create `supabase/2026-08-13-follow-request-and-mention-notifications.sql`:

```sql
-- ============================================================================
-- Follow-request + mention notifications. Idempotent; safe to re-run.
-- ============================================================================

-- 1. FOLLOW REQUEST ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_follow_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_username TEXT;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;  -- grandfathered/auto-accepted follows are not requests
  END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = NEW.follower_id;
  INSERT INTO public.notifications (user_id, type, content, read)
  VALUES (
    NEW.following_id,
    'follow_request',
    jsonb_build_object(
      'requester', COALESCE(v_username, 'Someone'),
      'requesterId', NEW.follower_id,
      'requesterUsername', v_username
    ),
    false
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_follow_request_notify ON public.follows;
CREATE TRIGGER on_follow_request_notify
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow_request();

-- 2. MENTIONS ---------------------------------------------------------------
-- Best-effort @handle parser: extracts @username tokens from free text and
-- inserts one 'mention' notification per existing, distinct, non-self user.
CREATE OR REPLACE FUNCTION public.create_mention_notifications(
  p_text TEXT, p_actor_id UUID, p_actor_name TEXT, p_context JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_handle TEXT;
  v_target UUID;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN;
  END IF;
  FOR v_handle IN
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(p_text, '@([A-Za-z0-9_]{2,30})', 'g') AS m
  LOOP
    SELECT id INTO v_target FROM public.profiles WHERE lower(username) = v_handle;
    IF v_target IS NULL OR v_target = p_actor_id THEN
      CONTINUE;
    END IF;
    INSERT INTO public.notifications (user_id, type, content, read)
    VALUES (
      v_target,
      'mention',
      p_context || jsonb_build_object('author', COALESCE(p_actor_name, 'Someone'), 'actorId', p_actor_id),
      false
    );
  END LOOP;
END; $$;

-- Comment mentions
CREATE OR REPLACE FUNCTION public.notify_on_comment_mention()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.create_mention_notifications(
    NEW.content, NEW.user_id, NEW.author_name,
    jsonb_build_object('source', 'comment', 'postId', NEW.post_id, 'postSlug', NEW.post_id, 'commentId', NEW.id)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_comment_mention ON public.comments;
CREATE TRIGGER on_comment_mention
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment_mention();

-- Post mentions (author's own text; post has no author_name, look it up)
CREATE OR REPLACE FUNCTION public.notify_on_post_mention()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author TEXT;
BEGIN
  SELECT username INTO v_author FROM public.profiles WHERE id = NEW.user_id;
  PERFORM public.create_mention_notifications(
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''),
    NEW.user_id, v_author,
    jsonb_build_object('source', 'post', 'postId', NEW.id, 'postSlug', NEW.slug, 'postTitle', NEW.title)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_post_mention ON public.posts;
CREATE TRIGGER on_post_mention
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_mention();

DO $$ BEGIN RAISE NOTICE '✅ follow-request + mention notifications installed'; END $$;
```

- [ ] **Step 2: Apply the migration**

Run the file in the Supabase SQL editor. Expected: `NOTICE: ✅ follow-request + mention notifications installed`, no errors.

- [ ] **Step 3: Verify follow-request notification (test)**

With two real user ids `<A>` (requester) and `<B>` (target):

```sql
DELETE FROM public.notifications WHERE user_id = '<B>' AND type = 'follow_request' AND content->>'requesterId' = '<A>';
DELETE FROM public.follows WHERE follower_id = '<A>' AND following_id = '<B>';
INSERT INTO public.follows (follower_id, following_id, status) VALUES ('<A>', '<B>', 'pending');
SELECT count(*) AS n FROM public.notifications
WHERE user_id = '<B>' AND type = 'follow_request' AND content->>'requesterId' = '<A>';
```

Expected: `n = 1`.

- [ ] **Step 4: Verify mention notification (test)**

Given a profile with username `alice` (id `<ALICE>`) and any post id `<POST>` authored by a different user `<AUTHOR>`:

```sql
DELETE FROM public.notifications WHERE user_id = '<ALICE>' AND type = 'mention';
INSERT INTO public.comments (post_id, user_id, author_name, content)
VALUES ('<POST>', '<AUTHOR>', 'bob', 'hey @alice check this out');
SELECT count(*) AS n, max(content->>'source') AS source
FROM public.notifications WHERE user_id = '<ALICE>' AND type = 'mention';
```

Expected: `n = 1`, `source = comment`. (Cleanup the inserted comment/notification afterwards.)

- [ ] **Step 5: Commit**

```bash
git add supabase/2026-08-13-follow-request-and-mention-notifications.sql
git commit -m "feat(notifications): create follow-request and mention notification rows"
```

---

### Task 3: Email render helper (pure, TDD)

The one genuinely unit-testable unit: turn a list of unread notifications into `{ subject, html }`. No DB or network.

**Files:**
- Create: `lib/notification-email.ts`
- Test: `tests/notification-email.test.ts`

**Interfaces:**
- Produces:
  - `type EmailNotification = { type: string; content: Record<string, unknown>; created_at: string }`
  - `interface RenderOptions { appUrl: string; unsubscribeUrl: string }`
  - `function summarizeActivity(notes: EmailNotification[]): { total: number; lines: string[] }`
  - `function renderActivityEmail(notes: EmailNotification[], opts: RenderOptions): { subject: string; html: string }`
- Consumed by: Task 4 (`api/notifications-cron.ts`).

- [ ] **Step 1: Write the failing test**

Create `tests/notification-email.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizeActivity, renderActivityEmail, type EmailNotification } from '../lib/notification-email';

const at = (type: string, content: Record<string, unknown> = {}): EmailNotification =>
  ({ type, content, created_at: '2026-08-13T00:00:00Z' });

const opts = { appUrl: 'https://cicada.city', unsubscribeUrl: 'https://cicada.city/api/notifications-cron?action=unsubscribe&token=tok' };

describe('summarizeActivity', () => {
  it('counts and groups across types', () => {
    const r = summarizeActivity([
      at('dm_message', { senderUsername: 'alice' }),
      at('dm_message', { senderUsername: 'bob' }),
      at('reaction'), at('reaction'), at('reaction'),
      at('comment', { postTitle: 'Hello' }),
      at('follow_request', { requester: 'carol' }),
      at('mention'),
    ]);
    expect(r.total).toBe(8);
    // one line per non-empty group: dm, like, comment, follow, mention
    expect(r.lines.length).toBe(5);
    expect(r.lines.some(l => l.includes('2') && /message/i.test(l))).toBe(true);
    expect(r.lines.some(l => l.includes('3') && /lik/i.test(l))).toBe(true);
  });

  it('ignores unknown types in the group lines but still counts total', () => {
    const r = summarizeActivity([at('reaction'), at('some_future_type')]);
    expect(r.total).toBe(2);
    expect(r.lines.length).toBe(1); // only the like group renders a line
  });
});

describe('renderActivityEmail', () => {
  it('subject reflects the total and html carries the unsubscribe url', () => {
    const notes = [at('reaction'), at('comment', { postTitle: 'X' })];
    const { subject, html } = renderActivityEmail(notes, opts);
    expect(subject).toMatch(/2/);
    expect(subject.toLowerCase()).toContain('notification');
    expect(html).toContain(opts.unsubscribeUrl);
    expect(html).toContain(opts.appUrl);
  });

  it('single notification gets a specific subject', () => {
    const { subject } = renderActivityEmail([at('dm_message', { senderUsername: 'alice' })], opts);
    expect(subject.toLowerCase()).toContain('message');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- notification-email`
Expected: FAIL — cannot find module `../lib/notification-email`.

- [ ] **Step 3: Implement the render helper**

Create `lib/notification-email.ts`:

```ts
// lib/notification-email.ts — pure email rendering for activity notifications.
export type EmailNotification = {
  type: string;
  content: Record<string, unknown>;
  created_at: string;
};

export interface RenderOptions {
  appUrl: string;
  unsubscribeUrl: string;
}

type Group = { key: string; label: (n: number, names: string[]) => string };

// Map notification types onto display groups. Order defines line order.
const GROUPS: { types: string[]; def: Group }[] = [
  { types: ['dm_message', 'dm', 'message'], def: { key: 'dm',
      label: (n, names) => `💬 ${n} new ${n === 1 ? 'message' : 'messages'}${names.length ? ' from ' + names.join(', ') : ''}` } },
  { types: ['reaction', 'like'], def: { key: 'like',
      label: (n) => `👍 ${n} ${n === 1 ? 'like' : 'likes'} on your posts` } },
  { types: ['comment', 'reply'], def: { key: 'comment',
      label: (n) => `💬 ${n} new ${n === 1 ? 'comment' : 'comments'}` } },
  { types: ['follow_request', 'follow_approved', 'follow'], def: { key: 'follow',
      label: (n) => `👥 ${n} follow ${n === 1 ? 'update' : 'updates'}` } },
  { types: ['mention'], def: { key: 'mention',
      label: (n) => `📣 ${n} ${n === 1 ? 'mention' : 'mentions'}` } },
];

function nameOf(n: EmailNotification): string | null {
  const c = n.content || {};
  return (c.senderUsername as string) || (c.requester as string) || (c.author as string) || null;
}

export function summarizeActivity(notes: EmailNotification[]): { total: number; lines: string[] } {
  const lines: string[] = [];
  for (const { types, def } of GROUPS) {
    const inGroup = notes.filter((n) => types.includes(n.type));
    if (inGroup.length === 0) continue;
    const names = Array.from(new Set(inGroup.map(nameOf).filter((x): x is string => !!x))).slice(0, 3);
    lines.push(def.label(inGroup.length, names));
  }
  return { total: notes.length, lines };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderActivityEmail(
  notes: EmailNotification[],
  opts: RenderOptions,
): { subject: string; html: string } {
  const { total, lines } = summarizeActivity(notes);

  let subject: string;
  if (total === 1) {
    const only = lines[0] ? lines[0].replace(/^[^\w]+/, '') : 'new activity';
    // For a single item, prefer a concrete subject.
    const single = notes[0];
    if (['dm_message', 'dm', 'message'].includes(single.type)) subject = 'New message on Sin City';
    else if (['reaction', 'like'].includes(single.type)) subject = 'Someone liked your post on Sin City';
    else if (['comment', 'reply'].includes(single.type)) subject = 'New comment on Sin City';
    else if (single.type === 'mention') subject = 'You were mentioned on Sin City';
    else if (single.type.startsWith('follow')) subject = 'New follow activity on Sin City';
    else subject = `1 new notification on Sin City (${esc(only)})`;
  } else {
    subject = `You have ${total} new notifications on Sin City`;
  }

  const items = lines.map((l) => `<li style="margin:8px 0;">${esc(l)}</li>`).join('');
  const html = `
  <div style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:40px;max-width:520px;margin:0 auto;">
    <h1 style="border-bottom:1px solid #22c55e;padding-bottom:16px;">Sin City</h1>
    <p>You have new activity while you were away:</p>
    <ul style="list-style:none;padding:0;">${items}</ul>
    <p style="margin-top:24px;">
      <a href="${opts.appUrl}" style="color:#22c55e;">Open Sin City &rarr;</a>
    </p>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #333;font-size:12px;color:#666;">
      Sin City ·
      <a href="${opts.unsubscribeUrl}" style="color:#888;">Unsubscribe from activity emails</a>
    </div>
  </div>`;

  return { subject, html };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- notification-email`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notification-email.ts tests/notification-email.test.ts
git commit -m "feat(email): pure activity-email render helper with tests"
```

---

### Task 4: Cron worker + unsubscribe endpoint

Drains due queue entries, sends one coalesced email per user, and serves the login-free unsubscribe link.

**Files:**
- Create: `api/notifications-cron.ts`

**Interfaces:**
- Consumes: `renderActivityEmail`, `EmailNotification` (Task 3); `send()` (`lib/verification-email.js`); `getServiceClient()` (`lib/verification-db.js`); tables from Task 1.
- Endpoint: `GET|POST /api/notifications-cron?action=cron` (Bearer `CRON_SECRET`) and `GET /api/notifications-cron?action=unsubscribe&token=<uuid>`.

- [ ] **Step 1: Write the worker**

Create `api/notifications-cron.ts`:

```ts
// api/notifications-cron.ts — sends coalesced activity emails; handles unsubscribe.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../lib/verification-db.js';
import { send } from '../lib/verification-email.js';
import { renderActivityEmail, type EmailNotification } from '../lib/notification-email.js';

const APP_URL = process.env.APP_URL || 'https://cicada.city';
const MAX_BATCH = 200;
const MAX_UNREAD = 50;
const STALE_HOURS = 6; // give up on an entry that keeps failing to send

function unsubscribeUrl(token: string): string {
  return `${APP_URL}/api/notifications-cron?action=unsubscribe&token=${encodeURIComponent(token)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string | undefined) || req.body?.action;

  // ---- unsubscribe (public, token-gated) ----
  if (action === 'unsubscribe') {
    const token = String(req.query.token || '');
    const page = (msg: string) =>
      res.status(200).setHeader('Content-Type', 'text/html').send(
        `<html><body style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:40px;text-align:center;">
           <h1>Sin City</h1><p>${msg}</p></body></html>`);
    if (!token) return page('Invalid unsubscribe link.');
    try {
      const sb = getServiceClient();
      const { data } = await sb.from('notification_email_settings')
        .update({ email_enabled: false, updated_at: new Date().toISOString() })
        .eq('unsubscribe_token', token).select('user_id');
      if (!data || data.length === 0) return page('This unsubscribe link is no longer valid.');
      return page('You have been unsubscribed from activity emails. You can re-enable them in Settings.');
    } catch (e) {
      console.error('[notifications-cron:unsubscribe]', e);
      return page('Something went wrong. Please try again later.');
    }
  }

  // ---- cron (Bearer CRON_SECRET) ----
  if (action === 'cron') {
    if ((req.headers.authorization || '') !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const sb = getServiceClient();
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      let sent = 0, skipped = 0, failed = 0;

      const { data: due } = await sb.from('notification_email_queue')
        .select('id, user_id, created_at')
        .eq('status', 'pending').lte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true }).limit(MAX_BATCH);

      const markSent = (id: string) =>
        sb.from('notification_email_queue').update({ status: 'sent', sent_at: nowIso }).eq('id', id);
      const markCancelled = (id: string) =>
        sb.from('notification_email_queue').update({ status: 'cancelled' }).eq('id', id);

      for (const entry of due || []) {
        const { data: settings } = await sb.from('notification_email_settings')
          .select('email_enabled, unsubscribe_token').eq('user_id', entry.user_id).maybeSingle();

        if (settings && settings.email_enabled === false) { await markSent(entry.id); skipped++; continue; }

        const { data: unread } = await sb.from('notifications')
          .select('type, content, created_at')
          .eq('user_id', entry.user_id).eq('read', false)
          .order('created_at', { ascending: false }).limit(MAX_UNREAD);

        if (!unread || unread.length === 0) { await markSent(entry.id); skipped++; continue; }

        const { data: adminUser } = await sb.auth.admin.getUserById(entry.user_id);
        const email = adminUser?.user?.email;
        if (!email) { await markSent(entry.id); skipped++; continue; }

        const token = settings?.unsubscribe_token || '';
        const { subject, html } = renderActivityEmail(unread as EmailNotification[], {
          appUrl: APP_URL, unsubscribeUrl: unsubscribeUrl(token),
        });

        const err = await send(email, subject, html);
        if (err) {
          console.error('[notifications-cron] send failed:', err);
          const ageHours = (nowMs - Date.parse(entry.created_at)) / 3600_000;
          if (ageHours > STALE_HOURS) { await markCancelled(entry.id); }
          failed++;
          continue; // leave pending for retry (unless cancelled above)
        }
        await markSent(entry.id);
        sent++;
      }

      return res.status(200).json({ sent, skipped, failed });
    } catch (e) {
      console.error('[notifications-cron:cron]', e);
      return res.status(500).json({ error: 'internal error' });
    }
  }

  return res.status(400).json({ error: 'unknown action' });
}
```

- [ ] **Step 2: Typecheck the API**

Run: `npm run typecheck:api`
Expected: no errors (add `List-Unsubscribe` header note deferred to Task 6; not required to compile).

- [ ] **Step 3: Integration test — send path**

In the Supabase SQL editor, seed a due entry for a user `<UID>` who has an `auth.users.email` and at least one unread notification:

```sql
INSERT INTO public.notifications (user_id, type, content) VALUES ('<UID>', 'reaction', '{"author":"tester"}');
UPDATE public.notification_email_queue SET scheduled_at = now() - interval '1 minute'
WHERE user_id = '<UID>' AND status = 'pending';
```

Then invoke the endpoint (locally via `vercel dev`, or against a deploy):

```bash
curl -s -X POST "$BASE_URL/api/notifications-cron?action=cron" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: JSON like `{"sent":1,"skipped":0,"failed":0}`, an email arrives, and:

```sql
SELECT status FROM public.notification_email_queue WHERE user_id = '<UID>' ORDER BY created_at DESC LIMIT 1;
```

returns `sent`.

- [ ] **Step 4: Integration test — skip when all read**

```sql
UPDATE public.notifications SET read = true WHERE user_id = '<UID>';
-- re-seed a due entry
INSERT INTO public.notifications (user_id, type, content) VALUES ('<UID>', 'comment', '{"author":"t"}');
UPDATE public.notifications SET read = true WHERE user_id = '<UID>';
UPDATE public.notification_email_queue SET status='pending', scheduled_at = now() - interval '1 minute'
WHERE user_id = '<UID>' ORDER BY created_at DESC LIMIT 1;
```

Invoke the cron again. Expected: `{"sent":0,"skipped":1,...}` and no email.

- [ ] **Step 5: Integration test — unsubscribe**

```sql
SELECT unsubscribe_token FROM public.notification_email_settings WHERE user_id = '<UID>';
```

Open `"$BASE_URL/api/notifications-cron?action=unsubscribe&token=<TOKEN>"` in a browser. Expected: "You have been unsubscribed" page, and:

```sql
SELECT email_enabled FROM public.notification_email_settings WHERE user_id = '<UID>';
```

returns `false`. Re-enable for cleanup: `UPDATE ... SET email_enabled = true`.

- [ ] **Step 6: Commit**

```bash
git add api/notifications-cron.ts
git commit -m "feat(email): cron worker sends coalesced activity emails + unsubscribe endpoint"
```

---

### Task 5: Generalize the settings UI

Repoint the existing settings component from `dm_notification_settings` to `notification_email_settings` and relabel it as general activity emails (single global toggle + delay). Keep the default export name so `NotificationBell` keeps working.

**Files:**
- Modify: `src/components/settings/DMNotificationSettings.tsx`

**Interfaces:**
- Consumes: `notification_email_settings` table (Task 1); `supabase` client; `useAuth()`.
- Preserves: default export `NotificationSettings` (imported by `NotificationBell.tsx`).

- [ ] **Step 1: Update the table name and copy**

In `src/components/settings/DMNotificationSettings.tsx`:

Change the fetch query table (around line 26) from:

```ts
                    .from('dm_notification_settings')
```

to:

```ts
                    .from('notification_email_settings')
```

Change the upsert table (around line 55) from:

```ts
                .from('dm_notification_settings')
```

to:

```ts
                .from('notification_email_settings')
```

Update the header copy (around lines 91-97) from:

```tsx
                <h3 className="text-xl font-bold text-green-400 mb-2 font-mono">
                    DM Email Notifications
                </h3>
                <p className="text-sm text-gray-400 font-mono">
                    Get notified by email when you receive new messages while offline
                </p>
```

to:

```tsx
                <h3 className="text-xl font-bold text-green-400 mb-2 font-mono">
                    Activity Email Notifications
                </h3>
                <p className="text-sm text-gray-400 font-mono">
                    Get a summary email for messages, likes, comments, follows and mentions you haven't seen yet
                </p>
```

Update the footer bullets (around lines 169-173) from:

```tsx
                <p>• Emails are only sent when you're offline</p>
                <p>• Opening the conversation cancels pending emails</p>
                <p>• Max one email per conversation per unread period</p>
```

to:

```tsx
                <p>• One summary email per delay window, only for unread activity</p>
                <p>• Reading it in the app before the delay skips the email</p>
                <p>• Turn this off any time here or via the unsubscribe link in the email</p>
```

- [ ] **Step 2: Verify the app builds and the component renders**

Run: `npm run build`
Expected: build succeeds with no type errors.

Then run `npm run dev`, open the settings surface that renders `NotificationBell`/`NotificationSettings`, and confirm the toggle + delay buttons load your current values (they read from `notification_email_settings`, which the Task 1 helper/trigger populate on first notification). Toggling and saving shows "Settings saved successfully!" and:

```sql
SELECT email_enabled, delay_minutes FROM public.notification_email_settings WHERE user_id = '<your-uid>';
```

reflects the change.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/DMNotificationSettings.tsx
git commit -m "feat(settings): generalize DM email settings to all activity emails"
```

---

### Task 6: Schedule the cron, add List-Unsubscribe header, wire env + rollout

Enable the worker on a schedule, add the RFC-compliant unsubscribe header, document env vars, and run an end-to-end check across all interaction types.

**Files:**
- Modify: `vercel.json`
- Modify: `api/notifications-cron.ts`
- Modify: `.env.example` (create if absent)

**Interfaces:**
- Consumes: everything from Tasks 1–5.

- [ ] **Step 1: Add the `List-Unsubscribe` header to sent emails**

The `send()` helper only sends `from/to/subject/html`, so set the header at the Resend call. In `api/notifications-cron.ts`, the simplest compliant approach is to include the header via a thin inline send in the cron branch. Replace the `send(email, subject, html)` call with a local `sendWithUnsub` that adds headers:

```ts
        const err = await sendWithUnsub(email, subject, html, unsubscribeUrl(token));
```

and add this helper near the top of the file (below imports):

```ts
async function sendWithUnsub(to: string, subject: string, html: string, unsub: string): Promise<string | null> {
  const key = process.env.RESEND_API_KEY || '';
  if (!key) return 'RESEND_API_KEY not configured';
  const from = process.env.FROM_EMAIL || 'Sin City <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject, html,
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({} as Record<string, unknown>)); return `Resend error: ${(e as Record<string, unknown>).message || r.status}`; }
    return null;
  } catch (e: any) { return `Email send failed: ${e.message || 'unknown'}`; }
}
```

Remove the now-unused `send` import if nothing else in the file uses it (the `renderActivityEmail` import stays).

Run: `npm run typecheck:api`
Expected: no errors.

- [ ] **Step 2: Add the cron schedule to `vercel.json`**

Add a top-level `crons` array (keep the existing `rewrites`):

```json
{
    "crons": [
        { "path": "/api/notifications-cron?action=cron", "schedule": "*/5 * * * *" }
    ],
    "rewrites": [
        { "source": "/api/og/:slug", "destination": "/api/og/[slug]" },
        { "source": "/api/:path*", "destination": "/api/:path*" },
        { "source": "/((?!api/).*)", "destination": "/index.html" }
    ]
}
```

Note (do not skip): Vercel-native cron authenticates by injecting the `CRON_SECRET` as the `Authorization: Bearer` header automatically only when `CRON_SECRET` is set in project env. If this project is on the **Hobby** plan (daily-only cron), instead of the `crons` entry keep the endpoint and point your existing external cron caller at `/api/notifications-cron?action=cron` every 5 minutes with the `Authorization: Bearer $CRON_SECRET` header. Record which path you chose in the commit message.

- [ ] **Step 3: Document env vars**

Ensure `.env.example` lists (create the file if missing, values as placeholders):

```
# Email notifications (server-side)
RESEND_API_KEY=re_xxx
FROM_EMAIL=Sin City <noreply@your-verified-domain>
CRON_SECRET=change-me
APP_URL=https://cicada.city
```

Confirm these are set in Vercel Project → Settings → Environment Variables for Production. `FROM_EMAIL` MUST use a Resend-verified domain in production (`onboarding@resend.dev` is test-only).

- [ ] **Step 4: End-to-end verification**

On a deploy with cron enabled (or by manually curling the endpoint), for a test recipient with email notifications on and the app closed:

1. From a second account, trigger each interaction against the recipient: like a post, comment on a post, send a DM, send a follow request, and post/comment text containing `@<recipient-username>`.
2. Confirm each created a `notifications` row and exactly one pending queue row:

```sql
SELECT type FROM public.notifications WHERE user_id='<UID>' AND read=false ORDER BY created_at DESC;
SELECT count(*) FROM public.notification_email_queue WHERE user_id='<UID>' AND status='pending'; -- expect 1
```

3. Wait for the delay (or set `scheduled_at` into the past and curl the cron). Confirm one email arrives summarizing all of it, with a working unsubscribe link and (via "show original" in the mail client) a `List-Unsubscribe` header.
4. Read the notifications in-app, trigger a new one, and confirm that reading before the next delay window results in `skipped` (no email) on the following cron run.

- [ ] **Step 5: Commit**

```bash
git add vercel.json api/notifications-cron.ts .env.example
git commit -m "chore(email): schedule cron, add List-Unsubscribe header, document env"
```

---

## Self-Review

**Spec coverage:**
- DMs / likes / comments / follows / mentions emailed → Task 1 trigger + Task 2 wiring cover all five types. ✓
- Delayed + coalesced, one email per user → partial unique index + summary render (Tasks 1, 3). ✓
- Single global toggle → `email_enabled` in settings, honored at enqueue and send (Tasks 1, 4, 5). ✓
- Unified notifications-driven queue → Task 1. ✓
- Retire DM queue → Task 1 §4/§5. ✓
- Unsubscribe (login-free) + `List-Unsubscribe` header → Tasks 4 and 6. ✓
- Wire follow-request + mention rows → Task 2. ✓
- Cron cadence + Hobby fallback → Task 6. ✓
- Deliverability (verified `FROM_EMAIL`) → Task 6 §3. ✓
- Testing: SQL coalescing/opt-out, render unit tests, send/skip/unsubscribe integration → Tasks 1–4. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full content. ✓

**Type consistency:** `renderActivityEmail(notes, { appUrl, unsubscribeUrl })` and `EmailNotification` are defined in Task 3 and consumed with the same shape in Task 4. `get_notification_email_settings` returns `(email_enabled, delay_minutes)` and is used that way by the enqueue trigger. Queue columns (`status`, `scheduled_at`, `sent_at`, `created_at`, `user_id`) are consistent across Tasks 1 and 4. ✓

**Known limitation (documented, acceptable):** mention detection is best-effort regex over raw text; rich-text/markdown that obscures a handle may miss a mention. Acceptable for v1.
