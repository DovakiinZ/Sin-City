-- Fix Admin Access to Posts and Admin Panel
-- This script adds admin bypass logic to the posts SELECT policy
-- so admins can see ALL posts including other users' drafts

-- ============================================================================
-- FIX POSTS SELECT POLICY - ADD ADMIN BYPASS
-- ============================================================================

-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "posts_select_policy" ON public.posts;
DROP POLICY IF EXISTS "Published posts readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "posts_select" ON public.posts;

-- Create new SELECT policy with admin bypass
-- Everyone can see published posts
-- Users can see their own drafts
-- ADMINS CAN SEE ALL POSTS (including all drafts)
CREATE POLICY "posts_select_policy"
  ON public.posts FOR SELECT
  USING (
    draft = false OR 
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- VERIFY ADMIN ROLE IS ASSIGNED
-- ============================================================================

-- Check current admin status
DO $$
DECLARE
  admin_count INTEGER;
  first_user_id UUID;
BEGIN
  -- Count admins
  SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
  
  IF admin_count = 0 THEN
    RAISE NOTICE 'No admin users found. Assigning admin to first user...';
    
    -- Get the first user (oldest account)
    SELECT id INTO first_user_id FROM public.profiles ORDER BY created_at LIMIT 1;
    
    IF first_user_id IS NOT NULL THEN
      -- Make first user admin
      UPDATE public.profiles 
      SET role = 'admin' 
      WHERE id = first_user_id;
      
      RAISE NOTICE 'First user (%) has been set as admin', first_user_id;
    ELSE
      RAISE NOTICE 'No users found in profiles table. First user to sign up will be admin.';
    END IF;
  ELSE
    RAISE NOTICE 'Found % admin user(s)', admin_count;
  END IF;
END $$;

-- ============================================================================
-- ENSURE is_admin FUNCTION EXISTS
-- ============================================================================

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

-- Show current posts SELECT policy
SELECT 
  '=== POSTS SELECT POLICY ===' as info,
  policyname,
  cmd as operation,
  qual as using_clause
FROM pg_policies
WHERE tablename = 'posts' AND cmd = 'SELECT'
ORDER BY policyname;

-- Show all users and their roles
SELECT 
  '=== USER ROLES ===' as info,
  id,
  username,
  role,
  created_at,
  CASE WHEN role = 'admin' THEN '✓ ADMIN' ELSE 'User' END as status
FROM public.profiles
ORDER BY created_at;

-- Count posts by draft status
SELECT 
  '=== POSTS SUMMARY ===' as info,
  draft,
  COUNT(*) as count
FROM public.posts
GROUP BY draft;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Admin access fix applied successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '1. Posts SELECT policy updated with admin bypass';
  RAISE NOTICE '2. Admin role verified and assigned';
  RAISE NOTICE '3. is_admin() function recreated';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '- Log in with your admin account';
  RAISE NOTICE '- Navigate to /admin';
  RAISE NOTICE '- You should now see ALL posts in the Posts tab';
  RAISE NOTICE '- You should be able to manage all content';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
