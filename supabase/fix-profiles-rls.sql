-- Ensure profiles are readable by everyone
-- Run this in Supabase SQL Editor

-- Enable RLS on profiles if not already
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow public read access to profiles
-- (Drop first to avoid conflicts if it exists with different name/rules)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone" 
ON profiles FOR SELECT 
TO public 
USING (true);

-- Ensure common columns exist and are queryable
-- We need: id, username, display_name, avatar_url
-- This part is just a comment, assuming table structure is correct based on previous files.
