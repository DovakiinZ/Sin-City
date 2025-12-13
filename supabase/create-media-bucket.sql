-- Create a storage bucket for post media if it doesn't exist
-- Run this in Supabase SQL Editor

-- First, let's use the 'avatars' bucket that likely exists, or create a new 'media' bucket

-- Option 1: If avatars bucket exists but has restricted path:
-- Just use the existing bucket with a different path prefix

-- Option 2: Create a dedicated media bucket:
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the media bucket
CREATE POLICY "Allow authenticated uploads to media" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'media' 
    AND auth.role() = 'authenticated'
);

-- Allow public read access to media
CREATE POLICY "Allow public read media" ON storage.objects
FOR SELECT USING (bucket_id = 'media');

-- Allow users to delete their own media
CREATE POLICY "Allow users to delete own media" ON storage.objects
FOR DELETE USING (
    bucket_id = 'media'
    AND auth.uid()::text = (storage.foldername(name))[2]
);
