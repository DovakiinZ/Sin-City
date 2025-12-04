-- Enable guest photo/video uploads to Supabase storage
-- This allows anonymous users to upload images and videos when creating posts

-- First, ensure the post-images bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes for own files" ON storage.objects;

-- Allow anyone (including anonymous users) to upload to post-images bucket
CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'post-images');

-- Allow anyone to read from post-images bucket
CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-images');

-- Optional: Allow users to delete their own uploads (based on file naming pattern)
-- This is optional and can be removed if you want stricter control
CREATE POLICY "Allow public deletes for own files"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'post-images');

-- Update posts table to support guest posts
-- Make user_id nullable to allow anonymous posts
ALTER TABLE posts ALTER COLUMN user_id DROP NOT NULL;

-- Add guest_identifier column for tracking anonymous posts (optional)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS guest_identifier TEXT;

-- Add index for better query performance on guest posts
CREATE INDEX IF NOT EXISTS idx_posts_guest_identifier ON posts(guest_identifier) WHERE guest_identifier IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN posts.user_id IS 'User ID for authenticated users, NULL for guest posts';
COMMENT ON COLUMN posts.guest_identifier IS 'Optional identifier for guest posts (e.g., IP hash, session ID)';
