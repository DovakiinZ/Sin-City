-- Fix storage RLS policies for media bucket
-- Run this in Supabase SQL Editor

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow authenticated uploads to media" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read media" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own media" ON storage.objects;

-- Allow ANY authenticated user to upload to media bucket
CREATE POLICY "Allow authenticated uploads to media" ON storage.objects
FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'media');

-- Allow public read access to media
CREATE POLICY "Allow public read media" ON storage.objects
FOR SELECT 
TO public
USING (bucket_id = 'media');

-- Allow authenticated users to update their uploads
CREATE POLICY "Allow authenticated update media" ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'media');

-- Allow authenticated users to delete media
CREATE POLICY "Allow authenticated delete media" ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'media');
