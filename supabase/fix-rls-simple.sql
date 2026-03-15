-- Simple RLS Fix - Run this to fix all permission issues
-- This script safely drops and recreates all policies

-- ============================================================================
-- DROP ALL EXISTING POLICIES (safe - won't error if they don't exist)
-- ============================================================================

-- Posts table policies
DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_authenticated" ON public.posts;
DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
DROP POLICY IF EXISTS "Everyone can read published posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;

-- Music table policies
DROP POLICY IF EXISTS "music_select_all" ON public.music_links;
DROP POLICY IF EXISTS "music_modify_authenticated" ON public.music_links;
DROP POLICY IF EXISTS "Everyone can view active music links" ON public.music_links;

-- ============================================================================
-- CREATE NEW SIMPLE POLICIES
-- ============================================================================

-- POSTS: Everyone can read, authenticated can create/edit/delete
CREATE POLICY "posts_select_all"
  ON public.posts FOR SELECT
  USING (true);

CREATE POLICY "posts_insert_authenticated"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- MUSIC: Everyone can read, authenticated can manage
CREATE POLICY "music_select_all"
  ON public.music_links FOR SELECT
  USING (true);

CREATE POLICY "music_modify_authenticated"
  ON public.music_links FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT '✅ RLS Policies Fixed!' as status;

SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('posts', 'music_links')
ORDER BY tablename, cmd;
