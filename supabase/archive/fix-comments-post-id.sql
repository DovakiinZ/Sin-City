-- Fix comments table post_id type
-- The comments table post_id should be TEXT to match how we use it
-- Run this in Supabase SQL Editor

-- First, check if comments table exists
DO $$
BEGIN
    -- Check if the column type is uuid, if so convert to text
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'comments' 
        AND column_name = 'post_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Need to change UUID to TEXT
        ALTER TABLE comments ALTER COLUMN post_id TYPE TEXT USING post_id::TEXT;
        RAISE NOTICE 'Changed post_id from UUID to TEXT';
    ELSE
        RAISE NOTICE 'post_id is already TEXT or table does not exist';
    END IF;
END $$;

-- Alternatively, if the above fails, you can recreate the comments table:
-- DROP TABLE IF EXISTS comments;
-- CREATE TABLE comments (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     post_id TEXT NOT NULL,
--     user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
--     author_name TEXT NOT NULL,
--     content TEXT NOT NULL,
--     created_at TIMESTAMPTZ DEFAULT now(),
--     updated_at TIMESTAMPTZ DEFAULT now()
-- );
