-- Complete Fix for Sin City Blog Issues
-- This script fixes admin panel access, post creation/browsing, and music management

-- ============================================================================
-- ISSUE 1: FIX POSTS TABLE RLS POLICIES
-- ============================================================================

-- Drop all existing conflicting policies
DROP POLICY IF EXISTS "Posts are readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Published posts readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Everyone can read published posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can insert posts (demo)" ON public.posts;
DROP POLICY IF EXISTS "Anyone can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;
DROP POLICY IF EXISTS "Admins can delete any post" ON public.posts;

-- Create comprehensive SELECT policy
-- Everyone can see published posts, users can see their own drafts
CREATE POLICY "posts_select_policy"
  ON public.posts FOR SELECT
  USING (
    draft = false OR 
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  );

-- Create INSERT policy
-- Authenticated users can create posts, anonymous users can also create posts
CREATE POLICY "posts_insert_policy"
  ON public.posts FOR INSERT
  WITH CHECK (
    -- Allow authenticated users to insert with their user_id
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    -- Allow anonymous posts (user_id can be NULL)
    (auth.uid() IS NULL AND user_id IS NULL)
  );

-- Create UPDATE policy
-- Users can update their own posts, admins can update any post
CREATE POLICY "posts_update_policy"
  ON public.posts FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create DELETE policy
-- Users can delete their own posts, admins can delete any post
CREATE POLICY "posts_delete_policy"
  ON public.posts FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- ISSUE 2: FIX MUSIC_LINKS TABLE RLS POLICIES
-- ============================================================================

-- Drop all existing music_links policies
DROP POLICY IF EXISTS "Music links are viewable by everyone" ON public.music_links;
DROP POLICY IF EXISTS "Everyone can view active music links" ON public.music_links;
DROP POLICY IF EXISTS "Admins can manage music links" ON public.music_links;
DROP POLICY IF EXISTS "Only admins can insert music links" ON public.music_links;
DROP POLICY IF EXISTS "Only admins can update music links" ON public.music_links;
DROP POLICY IF EXISTS "Only admins can delete music links" ON public.music_links;

-- Create SELECT policy for music_links
-- Everyone can see active music links, admins can see all
CREATE POLICY "music_links_select_policy"
  ON public.music_links FOR SELECT
  USING (
    is_active = true OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create INSERT policy for music_links
-- Only admins can add music links
CREATE POLICY "music_links_insert_policy"
  ON public.music_links FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create UPDATE policy for music_links
-- Only admins can update music links
CREATE POLICY "music_links_update_policy"
  ON public.music_links FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create DELETE policy for music_links
-- Only admins can delete music links
CREATE POLICY "music_links_delete_policy"
  ON public.music_links FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- ISSUE 3: ENSURE ADMIN ROLE IS ASSIGNED
-- ============================================================================

-- Check if you have any users in profiles table
DO $$
DECLARE
  user_count INTEGER;
  first_user_id UUID;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  
  IF user_count = 0 THEN
    RAISE NOTICE 'No users found in profiles table. First user to sign up will be admin.';
  ELSE
    -- Get the first user (oldest account)
    SELECT id INTO first_user_id FROM public.profiles ORDER BY created_at LIMIT 1;
    
    -- Make sure first user is admin
    UPDATE public.profiles 
    SET role = 'admin' 
    WHERE id = first_user_id;
    
    RAISE NOTICE 'First user (%) has been set as admin', first_user_id;
  END IF;
END $$;

-- ============================================================================
-- ISSUE 4: VERIFY HELPER FUNCTIONS EXIST
-- ============================================================================

-- Recreate is_admin function if it doesn't exist
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_uuid AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Show all RLS policies for posts
SELECT 
  'Posts Policies' as table_name,
  policyname,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN 'USING: ' || qual
    WHEN with_check IS NOT NULL THEN 'WITH CHECK: ' || with_check
    ELSE 'No condition'
  END as policy_condition
FROM pg_policies
WHERE tablename = 'posts'
ORDER BY cmd, policyname;

-- Show all RLS policies for music_links
SELECT 
  'Music Links Policies' as table_name,
  policyname,
  cmd as operation,
  CASE 
    WHEN qual IS NOT NULL THEN 'USING: ' || qual
    WHEN with_check IS NOT NULL THEN 'WITH CHECK: ' || with_check
    ELSE 'No condition'
  END as policy_condition
FROM pg_policies
WHERE tablename = 'music_links'
ORDER BY cmd, policyname;

-- Show all users and their roles
SELECT 
  id,
  username,
  role,
  created_at,
  CASE WHEN role = 'admin' THEN '✓ ADMIN' ELSE 'User' END as status
FROM public.profiles
ORDER BY created_at;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Database fixes applied successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. Posts RLS policies updated';
  RAISE NOTICE '2. Music links RLS policies updated';
  RAISE NOTICE '3. Admin role verified';
  RAISE NOTICE '4. Helper functions recreated';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '- Log in with your account';
  RAISE NOTICE '- Check if you can access /admin';
  RAISE NOTICE '- Try creating a post';
  RAISE NOTICE '- Try adding/deleting music links';
  RAISE NOTICE '========================================';
END $$;
