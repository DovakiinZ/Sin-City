-- Add author_avatar column to posts table for profile pictures
-- Run this in Supabase SQL Editor

-- Add the author_avatar column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_avatar TEXT;

-- Add comment for documentation
COMMENT ON COLUMN posts.author_avatar IS 'Avatar URL or data URL for the post author';
