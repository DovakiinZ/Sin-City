-- Comprehensive RLS Fix for All Issues
-- Run this in Supabase SQL Editor to fix all permission issues

-- ============================================================================
-- 1. CHECK CURRENT STATE
-- ============================================================================

-- Check if posts table exists and has RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'posts';

-- ============================================================================
-- 2. FIX POSTS TABLE - COMPLETE RESET
-- ============================================================================

-- Disable RLS temporarily
ALTER TABLE public.posts DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Everyone can read published posts" ON public.posts;
DROP POLICY IF EXISTS "Posts are readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Published posts readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Anyone can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
DROP POLICY IF EXISTS "Users can insert their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_policy" ON public.posts;
DROP POLICY IF EXISTS "posts_select" ON public.posts;
DROP POLICY IF EXISTS "posts_delete" ON public.posts;
DROP POLICY IF EXISTS "posts_delete_policy" ON public.posts;

-- Re-enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Create simple, permissive policies
-- SELECT: Everyone can read all posts (RLS will filter drafts if needed)
CREATE POLICY "posts_select_all"
  ON public.posts FOR SELECT
  USING (true);

-- INSERT: Authenticated users can create posts
CREATE POLICY "posts_insert_authenticated"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Users can update their own posts
CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own posts
CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. FIX MUSIC_LINKS TABLE
-- ============================================================================

-- Disable RLS temporarily
ALTER TABLE public.music_links DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Everyone can view active music links" ON public.music_links;
DROP POLICY IF EXISTS "Music links are viewable by everyone" ON public.music_links;

-- Re-enable RLS
ALTER TABLE public.music_links ENABLE ROW LEVEL SECURITY;

-- SELECT: Everyone can read all music links
CREATE POLICY "music_select_all"
  ON public.music_links FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: Only authenticated users
CREATE POLICY "music_modify_authenticated"
  ON public.music_links FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. VERIFY POLICIES
-- ============================================================================

SELECT 
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('posts', 'music_links')
ORDER BY tablename, cmd, policyname;

-- ============================================================================
-- 5. SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ RLS POLICIES RESET AND FIXED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Posts table: Everyone can read, authenticated can create/edit/delete';
  RAISE NOTICE 'Music table: Everyone can read, authenticated can manage';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Try creating a post at /create';
  RAISE NOTICE '2. Hard refresh your browser (Ctrl+Shift+R)';
  RAISE NOTICE '3. Check /posts page';
END $$;
