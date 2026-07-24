-- Gate writes for verification_overdue/suspended REGISTERED users at the DB boundary.
--
-- Approach: RESTRICTIVE policies (not drop/recreate of existing permissive policies).
-- A restrictive policy is AND-combined with every permissive policy on the table, so a
-- table can have any number of permissive INSERT/UPDATE policies and an authenticated
-- write still requires account_can_write() to be true. This avoids the fail-open risk of
-- trying to enumerate/replace the real (and overlapping) permissive policy names.
--
-- Scoped TO authenticated so anonymous/guest writes are unaffected (account_can_write()
-- also returns true when the caller has no user_verification row). service_role bypasses
-- RLS entirely, so the cron and admin actions are unaffected. SELECT/DELETE are NOT gated
-- (restricted users can still read; un-like/un-follow via DELETE is allowed).
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.

-- POSTS — block creating and editing posts while restricted
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.posts;
CREATE POLICY "ev_require_verified_insert" ON public.posts
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());
DROP POLICY IF EXISTS "ev_require_verified_update" ON public.posts;
CREATE POLICY "ev_require_verified_update" ON public.posts
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.account_can_write())
  WITH CHECK (public.account_can_write());

-- COMMENTS / REPLIES
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.comments;
CREATE POLICY "ev_require_verified_insert" ON public.comments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- DIRECT MESSAGES
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.messages;
CREATE POLICY "ev_require_verified_insert" ON public.messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.session_messages;
CREATE POLICY "ev_require_verified_insert" ON public.session_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- FOLLOWS
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.follows;
CREATE POLICY "ev_require_verified_insert" ON public.follows
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- REACTIONS (likes)
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.reactions;
CREATE POLICY "ev_require_verified_insert" ON public.reactions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- POLL VOTES
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.post_poll_votes;
CREATE POLICY "ev_require_verified_insert" ON public.post_poll_votes
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- BOOKMARKS
DROP POLICY IF EXISTS "ev_require_verified_insert" ON public.bookmarks;
CREATE POLICY "ev_require_verified_insert" ON public.bookmarks
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());

-- STORAGE UPLOADS (media)
DROP POLICY IF EXISTS "ev_require_verified_insert" ON storage.objects;
CREATE POLICY "ev_require_verified_insert" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.account_can_write());
