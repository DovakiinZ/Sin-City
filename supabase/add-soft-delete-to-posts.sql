-- Migration: Add soft delete support to posts
-- This allows users to delete their own posts (soft delete)
-- Admins can still see deleted posts, but they are hidden from others

-- 1. Add is_deleted column
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- 2. Update existing SELECT policy
-- We need to handle:
--   - Non-admins: can only see is_deleted = false
--   - Admins: can see everything (is_deleted = true or false)

DROP POLICY IF EXISTS "Posts are readable by anyone" ON public.posts;

CREATE POLICY "Posts are readable by anyone"
  ON public.posts FOR SELECT
  USING (
    (is_deleted = false) OR 
    (EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    ))
  );

-- 3. Add UPDATE policy for authors to soft delete
-- This allows the author (user_id) to set is_deleted = true
CREATE POLICY "Authors can soft delete their own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    -- Only allow changing is_deleted or other fields if you are the author
    (auth.uid() = user_id)
  );

-- 4. Ensure admins can still hard delete if needed (already exists in some form usually, but let's be explicit)
DROP POLICY IF EXISTS "Admins can hard delete anything" ON public.posts;
CREATE POLICY "Admins can hard delete anything"
  ON public.posts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 5. If we have a general insert policy, keep it but ensure it doesn't conflict
-- The existing one was "Anyone can insert posts (demo)" 
-- If we want to be more secure:
-- CREATE POLICY "Authenticated users can insert posts" ON public.posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
