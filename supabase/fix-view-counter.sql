-- Fix View Counter for Posts
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

-- 2. Create or replace the increment function
CREATE OR REPLACE FUNCTION increment_post_views(post_uuid UUID)
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = post_uuid;
END;
$$;

-- 3. Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION increment_post_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_post_views(UUID) TO anon;

-- Done! View counter is now ready.
