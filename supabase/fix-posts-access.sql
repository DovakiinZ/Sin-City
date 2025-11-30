-- Diagnostic Script: Check Posts Table and RLS Policies
-- This script helps diagnose why posts might not be showing up

-- ============================================================================
-- 1. CHECK IF POSTS TABLE EXISTS AND HAS DATA
-- ============================================================================

SELECT 
  'Posts Table Check' as check_name,
  COUNT(*) as total_posts,
  COUNT(*) FILTER (WHERE draft = false) as published_posts,
  COUNT(*) FILTER (WHERE draft = true) as draft_posts
FROM public.posts;

-- ============================================================================
-- 2. SHOW SAMPLE POSTS
-- ============================================================================

SELECT 
  id,
  title,
  draft,
  created_at,
  author_name,
  user_id
FROM public.posts
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- 3. CHECK RLS POLICIES ON POSTS TABLE
-- ============================================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'posts';

-- ============================================================================
-- 4. TEST IF ANONYMOUS USERS CAN READ PUBLISHED POSTS
-- ============================================================================

-- This simulates what an anonymous user would see
SET ROLE anon;
SELECT COUNT(*) as posts_visible_to_anon
FROM public.posts
WHERE draft = false;
RESET ROLE;

-- ============================================================================
-- 5. TEST IF AUTHENTICATED USERS CAN READ PUBLISHED POSTS
-- ============================================================================

-- This simulates what an authenticated user would see
SET ROLE authenticated;
SELECT COUNT(*) as posts_visible_to_authenticated
FROM public.posts
WHERE draft = false;
RESET ROLE;

-- ============================================================================
-- 6. CHECK IF RLS IS ENABLED
-- ============================================================================

SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'posts';

-- ============================================================================
-- 7. SUMMARY AND RECOMMENDATIONS
-- ============================================================================

DO $$
DECLARE
  total_posts INT;
  published_posts INT;
  rls_enabled BOOLEAN;
BEGIN
  -- Count posts
  SELECT COUNT(*), COUNT(*) FILTER (WHERE draft = false)
  INTO total_posts, published_posts
  FROM public.posts;
  
  -- Check RLS
  SELECT rowsecurity INTO rls_enabled
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'posts';
  
  RAISE NOTICE '=== DIAGNOSTIC SUMMARY ===';
  RAISE NOTICE 'Total posts in database: %', total_posts;
  RAISE NOTICE 'Published posts (draft=false): %', published_posts;
  RAISE NOTICE 'RLS enabled: %', rls_enabled;
  
  IF total_posts = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  NO POSTS FOUND IN DATABASE';
    RAISE NOTICE 'Action: Create posts using the /create page';
  ELSIF published_posts = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  NO PUBLISHED POSTS (all posts are drafts)';
    RAISE NOTICE 'Action: Publish posts by setting draft=false';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '✅ Database has % published posts', published_posts;
    RAISE NOTICE 'If posts still not showing, check RLS policies above';
  END IF;
END $$;
