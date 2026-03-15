-- Add missing columns to posts table
-- Run this in Supabase SQL Editor

-- Add category_id column if missing
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category_id UUID;

-- Add slug column if missing  
ALTER TABLE posts ADD COLUMN IF NOT EXISTS slug TEXT;

-- Add updated_at column if missing
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add author_avatar column if missing
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_avatar TEXT;

-- Make user_id nullable
ALTER TABLE posts ALTER COLUMN user_id DROP NOT NULL;

-- Check current table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'posts' 
ORDER BY ordinal_position;
