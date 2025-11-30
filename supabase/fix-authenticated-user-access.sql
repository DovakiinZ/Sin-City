-- Migration: Fix RLS policies to allow authenticated users to see all published posts
-- This fixes the issue where authenticated users cannot see posts created by others or anonymous users

-- ============================================================================
-- FIX POSTS TABLE RLS POLICY
-- ============================================================================

-- Drop ALL possible existing policy variations
DROP POLICY IF EXISTS "Published posts readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Posts are readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Everyone can read published posts" ON public.posts;

-- Create a more permissive SELECT policy
-- Everyone (authenticated and anonymous) can see published posts (draft = false)
-- Users can also see their own drafts
CREATE POLICY "Everyone can read published posts"
  ON public.posts FOR SELECT
  USING (
    draft = false OR 
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  );

-- ============================================================================
-- FIX MUSIC LINKS TABLE RLS POLICY
-- ============================================================================

-- Drop all possible existing music links policy variations
DROP POLICY IF EXISTS "Music links are viewable by everyone" ON public.music_links;
DROP POLICY IF EXISTS "Everyone can view active music links" ON public.music_links;

-- Create corrected policy
-- Everyone can see active music links
-- Authenticated users can see all music links (for admin purposes)
CREATE POLICY "Everyone can view active music links"
  ON public.music_links FOR SELECT
  USING (
    is_active = true OR 
    auth.uid() IS NOT NULL
  );

-- ============================================================================
-- VERIFY ANONYMOUS POST CREATION
-- ============================================================================

-- Ensure the insert policy allows both authenticated and anonymous posts
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can insert posts" ON public.posts;

-- Create permissive insert policy
CREATE POLICY "Anyone can insert posts"
  ON public.posts FOR INSERT
  WITH CHECK (
    user_id IS NULL OR 
    (auth.role() = 'authenticated' AND user_id = auth.uid())
  );

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'RLS policies updated successfully!';
  RAISE NOTICE 'Authenticated users can now see all published posts and active music links';
  RAISE NOTICE 'Anonymous users can still create posts and see published content';
END $$;
