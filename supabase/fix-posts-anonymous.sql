-- Migration: Allow anonymous post creation
-- This relaxes the INSERT policy to allow posts without authentication

-- Drop the restrictive insert policy
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;

-- Create a more permissive insert policy
-- Allows authenticated users to create posts with their user_id
-- Allows anyone to create posts with null user_id (anonymous)
CREATE POLICY "Anyone can insert posts"
  ON public.posts FOR INSERT
  WITH CHECK (
    user_id IS NULL OR 
    (auth.role() = 'authenticated' AND user_id = auth.uid())
  );
