-- Quick fix: Allow anyone to create posts
-- Run this in Supabase SQL Editor

-- Drop existing restrictive policies on posts table
DROP POLICY IF EXISTS "Users can create their own posts" ON posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON posts;
DROP POLICY IF EXISTS "Anyone can view published posts" ON posts;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON posts;
DROP POLICY IF EXISTS "Enable read access for all users" ON posts;

-- Allow anyone (including guests) to insert posts
CREATE POLICY "Allow public inserts"
ON posts FOR INSERT
TO public
WITH CHECK (true);

-- Allow anyone to read posts
CREATE POLICY "Allow public reads"
ON posts FOR SELECT
TO public
USING (true);

-- Allow users to update their own posts (authenticated users only)
CREATE POLICY "Allow users to update own posts"
ON posts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own posts (authenticated users only)
CREATE POLICY "Allow users to delete own posts"
ON posts FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Make user_id nullable to support guest posts
ALTER TABLE posts ALTER COLUMN user_id DROP NOT NULL;

-- Verify RLS is enabled
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
