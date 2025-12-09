-- Fix Comments Table - Use TEXT for user_id instead of UUID
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. DROP AND RECREATE COMMENTS TABLE
-- ============================================

-- Drop the old table if it exists (this will delete existing comments!)
DROP TABLE IF EXISTS public.comments CASCADE;

-- Create with user_id as TEXT (not UUID) to support all user ID formats
CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id TEXT NOT NULL,
    user_id TEXT,  -- Changed from UUID to TEXT to support all ID formats
    content TEXT NOT NULL,
    author_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);

-- ============================================
-- 2. SET UP RLS POLICIES
-- ============================================

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "comments_select_all"
    ON public.comments FOR SELECT
    USING (true);

-- Authenticated users can insert
CREATE POLICY "comments_insert_authenticated"
    ON public.comments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Users can update own (compare as text)
CREATE POLICY "comments_update_own"
    ON public.comments FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

-- Users can delete own
CREATE POLICY "comments_delete_own"
    ON public.comments FOR DELETE
    TO authenticated
    USING (auth.uid()::text = user_id);

-- ============================================
-- 3. VERIFY
-- ============================================

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'comments';

SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'comments';
