-- Fix RLS policies to allow authenticated users to create posts
-- This fixes the "Failed to save post" error

-- ============================================================================
-- FIX POSTS TABLE INSERT POLICY
-- ============================================================================

-- Drop existing insert policies
DROP POLICY IF EXISTS "Anyone can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Users can insert their own posts" ON public.posts;

-- Create a simple policy: authenticated users can insert posts
CREATE POLICY "Authenticated users can create posts"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR user_id IS NULL
  );

-- Also ensure UPDATE policy exists for users to edit their own posts
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;

CREATE POLICY "Users can update own posts"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify policies
SELECT 
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename = 'posts'
ORDER BY cmd, policyname;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Posts table RLS policies updated!';
  RAISE NOTICE 'Authenticated users can now create and edit posts';
END $$;
