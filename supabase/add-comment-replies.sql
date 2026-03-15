-- Add parent_id column to comments table for threaded replies
-- Run this in your Supabase SQL Editor

-- Add parent_id column (nullable, references self)
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE;

-- Create index for faster lookups of replies
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'comments' AND column_name = 'parent_id';
