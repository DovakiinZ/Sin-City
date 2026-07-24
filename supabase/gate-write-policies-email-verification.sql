-- SELECT policies are intentionally NOT modified in this migration.
-- This migration only gates INSERT/UPDATE write policies behind account_can_write().

-- Implementation note: `SELECT policyname FROM pg_policies WHERE tablename='<t>';` and `\d <t>`
-- first to confirm exact policy names + `user_id`/`author_id` columns; adjust DROP names, keep
-- the gate clause identical. Do not touch guest/anon insert policies (no `auth.uid()` → gate returns true).

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
