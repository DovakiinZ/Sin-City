-- ============================================================================
-- ADD MEDIA SUPPORT TO MESSAGING
-- Run this after messaging-schema.sql to add image/video support
-- ============================================================================

-- Add media columns to session_messages
ALTER TABLE public.session_messages 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'video'));

-- Create index for media queries
CREATE INDEX IF NOT EXISTS idx_messages_media ON public.session_messages(media_type) WHERE media_type IS NOT NULL;

-- ============================================================================
-- CREATE STORAGE BUCKET FOR MESSAGE MEDIA
-- Run this in Supabase Dashboard > Storage > Create bucket
-- Name: message-media
-- Public: true
-- ============================================================================

-- Storage policies (run in SQL editor)
-- Note: You may need to create the bucket first in the Supabase Dashboard

-- Allow authenticated users to upload to their own folder
-- CREATE POLICY "Users can upload message media"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'message-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access
-- CREATE POLICY "Public can view message media"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (bucket_id = 'message-media');

-- ============================================================================
-- DONE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ MEDIA SUPPORT ADDED TO MESSAGING!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Columns added: media_url, media_type';
  RAISE NOTICE 'Create storage bucket: message-media (public)';
END $$;
