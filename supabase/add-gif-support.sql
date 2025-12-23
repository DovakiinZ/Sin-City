-- ============================================================================
-- ADD GIF SUPPORT TO POSTS AND COMMENTS
-- ============================================================================

-- Add gif_url column to posts
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS gif_url TEXT;

-- Add gif_url column to comments
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS gif_url TEXT;

-- ============================================================================
-- DONE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ GIF SUPPORT ADDED TO POSTS/COMMENTS!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Columns added: gif_url to posts and comments tables';
END $$;
