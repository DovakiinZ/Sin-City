-- Allow anonymous users to create posts
-- Run this in the Supabase SQL Editor

-- Update posts table RLS to allow anonymous inserts
DROP POLICY IF EXISTS "Anyone can create posts" ON posts;
CREATE POLICY "Anyone can create posts" ON posts
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Update posts table RLS to allow anonymous uploads to media bucket
-- This needs to be done in the Storage section of Supabase Dashboard:
-- 1. Go to Storage > media bucket > Policies
-- 2. Add a policy for INSERT that allows ALL users (anon role)
-- Example policy: bucket_id = 'media' AND (storage.foldername(name))[1] = 'post-media'

-- Note: If you want to limit what anonymous users can upload, add size limits:
-- storage.foldername(name) = 'post-media/anonymous' AND 
-- (storage.extension(name) IN ('jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm'))
