-- Add Hidden Column to Posts
-- Run this in Supabase SQL Editor

-- 1. Add hidden column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'posts' 
    AND column_name = 'hidden'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN hidden BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_posts_hidden ON public.posts(hidden);

-- Done! Hidden column is now available.
