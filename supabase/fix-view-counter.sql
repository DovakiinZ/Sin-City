-- Fix View Counter - Accept TEXT post ID instead of UUID
-- Run this in Supabase SQL Editor

-- 1. Add view_count column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'view_count'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN view_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- 2. Drop any existing functions with different signatures
DROP FUNCTION IF EXISTS increment_post_views(UUID);
DROP FUNCTION IF EXISTS increment_post_views(TEXT);

-- 3. Create function that accepts TEXT (works with both UUID and slug)
CREATE OR REPLACE FUNCTION increment_post_views(post_id_param TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  -- Try to match by id (UUID) or slug
  UPDATE public.posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id::text = post_id_param OR slug = post_id_param
  RETURNING view_count INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$;

-- 4. Grant execute permission
GRANT EXECUTE ON FUNCTION increment_post_views(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_post_views(TEXT) TO anon;

-- 5. Initialize view_count for existing posts
UPDATE public.posts SET view_count = 0 WHERE view_count IS NULL;

-- Verify
SELECT 'View counter function created successfully' as status;
