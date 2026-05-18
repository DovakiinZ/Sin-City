-- Fix comments table - Handle existing TEXT user_id column
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: DROP AND RECREATE COMMENTS TABLE
-- (This will delete existing comments - backup first if needed!)
-- ============================================

-- First drop all policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public comments are viewable by everyone" ON public.comments;
    DROP POLICY IF EXISTS "Users can insert their own comments" ON public.comments;
    DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
    DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
    DROP POLICY IF EXISTS "comments_select" ON public.comments;
    DROP POLICY IF EXISTS "comments_insert" ON public.comments;
    DROP POLICY IF EXISTS "comments_update" ON public.comments;
    DROP POLICY IF EXISTS "comments_delete" ON public.comments;
    DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
    DROP POLICY IF EXISTS "comments_insert_authenticated" ON public.comments;
    DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
    DROP POLICY IF EXISTS "comments_delete_own_or_admin" ON public.comments;
    DROP POLICY IF EXISTS "comments_select_policy" ON public.comments;
    DROP POLICY IF EXISTS "comments_insert_policy" ON public.comments;
    DROP POLICY IF EXISTS "comments_update_policy" ON public.comments;
    DROP POLICY IF EXISTS "comments_delete_policy" ON public.comments;
EXCEPTION
    WHEN undefined_table THEN NULL;
END $$;

-- Drop the table if it exists (to fix the TEXT user_id issue)
DROP TABLE IF EXISTS public.comments CASCADE;

-- ============================================
-- STEP 2: CREATE FRESH COMMENTS TABLE WITH UUID
-- ============================================

CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID,
    content TEXT NOT NULL,
    author_name TEXT,
    gif_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_comments_post_id ON public.comments(post_id);
CREATE INDEX idx_comments_user_id ON public.comments(user_id);
CREATE INDEX idx_comments_parent_id ON public.comments(parent_id);

-- ============================================
-- STEP 3: ENABLE RLS AND CREATE POLICIES
-- ============================================

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- SELECT: Everyone can read
CREATE POLICY "comments_select_policy"
    ON public.comments FOR SELECT
    USING (true);

-- INSERT: Authenticated users can create
CREATE POLICY "comments_insert_policy"
    ON public.comments FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: Own comments only
CREATE POLICY "comments_update_policy"
    ON public.comments FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- DELETE: Own comments only  
CREATE POLICY "comments_delete_policy"
    ON public.comments FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- ============================================
-- DONE!
-- ============================================
SELECT 'Comments table recreated with UUID user_id!' as status;
