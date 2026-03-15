-- ============================================================================
-- MUSIC METADATA CACHING FOR SIN CITY
-- Run in Supabase SQL Editor
-- ============================================================================

-- Add music_metadata column to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS music_metadata JSONB DEFAULT NULL;

-- Structure of music_metadata:
-- {
--   "url": "https://open.spotify.com/track/...",
--   "platform": "spotify" | "youtube" | "apple",
--   "title": "Song Title",
--   "artist": "Artist Name",
--   "cover_image": "https://...",
--   "preview_url": "https://..." (optional, for Spotify),
--   "cached_at": "2024-12-24T00:00:00Z",
--   "embed_url": "https://open.spotify.com/embed/track/..."
-- }

-- Create index for posts with music
CREATE INDEX IF NOT EXISTS idx_posts_has_music 
ON public.posts ((music_metadata IS NOT NULL));

COMMENT ON COLUMN public.posts.music_metadata IS 
'Cached metadata for embedded music (Spotify/YouTube/Apple Music). Includes title, artist, cover image for fallback display.';

-- ============================================================================
-- DONE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Music metadata caching column added to posts table!';
END $$;
