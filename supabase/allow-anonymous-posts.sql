-- ============================================================================
-- FIX: Allow Anonymous/Guest Users to Create Posts
-- ============================================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- 
-- ISSUE: The posts INSERT policy only allows 'authenticated' users,
--        which blocks anonymous guests with guest_id from posting.
-- ============================================================================

-- Step 1: Drop ALL existing INSERT policies on posts
DROP POLICY IF EXISTS "posts_insert_authenticated" ON public.posts;
DROP POLICY IF EXISTS "Anyone can create posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can create posts" ON public.posts;
DROP POLICY IF EXISTS "Users can insert their own posts" ON public.posts;
DROP POLICY IF EXISTS "posts_insert" ON public.posts;
DROP POLICY IF EXISTS "posts_insert_policy" ON public.posts;

-- Step 2: Create a permissive INSERT policy for ALL users (including anonymous)
-- This allows both authenticated users AND anonymous guests to create posts
CREATE POLICY "posts_insert_anyone" ON public.posts
  FOR INSERT
  TO public
  WITH CHECK (
    -- Either the user is authenticated and posting as themselves
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    -- Or the user is anonymous (guest) and has a guest_id
    (auth.uid() IS NULL AND guest_id IS NOT NULL AND user_id IS NULL)
  );

-- Step 3: Also ensure comments allow anonymous users
DROP POLICY IF EXISTS "comments_insert_anyone" ON public.comments;
DROP POLICY IF EXISTS "Anyone can insert comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments;

-- Check if comments table exists before creating policy
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'comments') THEN
    EXECUTE 'CREATE POLICY "comments_insert_anyone" ON public.comments
      FOR INSERT
      TO public
      WITH CHECK (
        (auth.uid() IS NOT NULL AND user_id = auth.uid())
        OR
        (auth.uid() IS NULL AND guest_id IS NOT NULL AND user_id IS NULL)
      )';
  END IF;
END $$;

-- Step 4: Verify the policy was created
SELECT 
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'posts' AND cmd = 'INSERT'
ORDER BY policyname;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ANONYMOUS POSTING NOW ENABLED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Both authenticated users and guests can now create posts.';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Hard refresh your browser (Ctrl+Shift+R)';
  RAISE NOTICE '2. Try creating a post as Anonymous';
  RAISE NOTICE '3. If media uploads fail, run fix-media-bucket-permissions.sql';
END $$;
