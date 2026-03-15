-- CLEAN UP ALL DUPLICATE POLICIES
-- This will remove ALL policies and create only the ones we need

-- ============================================================================
-- POSTS TABLE - Remove ALL policies
-- ============================================================================
DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_authenticated" ON public.posts;
DROP POLICY IF EXISTS "posts_select_all" ON public.posts;
DROP POLICY IF EXISTS "posts_select_policy" ON public.posts;
DROP POLICY IF EXISTS "posts_update" ON public.posts;
DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
DROP POLICY IF EXISTS "posts_update_policy" ON public.posts;

-- ============================================================================
-- MUSIC_LINKS TABLE - Remove ALL policies
-- ============================================================================
DROP POLICY IF EXISTS "music_modify_authenticated" ON public.music_links;
DROP POLICY IF EXISTS "music_links_delete_policy" ON public.music_links;
DROP POLICY IF EXISTS "Authenticated users can delete music links" ON public.music_links;
DROP POLICY IF EXISTS "music_links_delete" ON public.music_links;
DROP POLICY IF EXISTS "Authenticated users can insert music links" ON public.music_links;
DROP POLICY IF EXISTS "music_links_insert" ON public.music_links;
DROP POLICY IF EXISTS "music_links_insert_policy" ON public.music_links;
DROP POLICY IF EXISTS "music_links_select" ON public.music_links;
DROP POLICY IF EXISTS "music_links_select_policy" ON public.music_links;
DROP POLICY IF EXISTS "music_select_all" ON public.music_links;
DROP POLICY IF EXISTS "music_links_update_policy" ON public.music_links;
DROP POLICY IF EXISTS "Authenticated users can update music links" ON public.music_links;
DROP POLICY IF EXISTS "music_links_update" ON public.music_links;

-- ============================================================================
-- CREATE CLEAN, SIMPLE POLICIES
-- ============================================================================

-- POSTS: Simple and permissive
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON public.posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "posts_update" ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_delete" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- MUSIC: Simple and permissive
CREATE POLICY "music_select" ON public.music_links FOR SELECT USING (true);
CREATE POLICY "music_insert" ON public.music_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "music_update" ON public.music_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "music_delete" ON public.music_links FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- VERIFY - Should show exactly 4 policies per table
-- ============================================================================
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('posts', 'music_links')
ORDER BY tablename, cmd;

-- Count policies
SELECT 
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename IN ('posts', 'music_links')
GROUP BY tablename;
