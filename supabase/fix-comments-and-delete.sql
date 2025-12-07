-- Fix RLS policies for comments table and posts deletion
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CREATE COMMENTS TABLE IF NOT EXISTS
-- ============================================

CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

-- ============================================
-- 2. FIX COMMENTS RLS POLICIES
-- ============================================

-- Disable RLS temporarily
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "comments_select" ON comments;
DROP POLICY IF EXISTS "comments_insert" ON comments;
DROP POLICY IF EXISTS "comments_update" ON comments;
DROP POLICY IF EXISTS "comments_delete" ON comments;
DROP POLICY IF EXISTS "Anyone can read comments" ON comments;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON comments;
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

-- Re-enable RLS
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- SELECT: Everyone can read comments
CREATE POLICY "comments_select_all"
    ON comments FOR SELECT
    USING (true);

-- INSERT: Authenticated users can create comments
CREATE POLICY "comments_insert_authenticated"
    ON comments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE: Users can update their own comments
CREATE POLICY "comments_update_own"
    ON comments FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- DELETE: Users can delete their own comments, admins can delete any
CREATE POLICY "comments_delete_own_or_admin"
    ON comments FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- 3. FIX POSTS DELETE RLS POLICIES
-- ============================================

-- Drop and recreate delete policy for posts
DROP POLICY IF EXISTS "posts_delete_own" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;

-- DELETE: Users can delete their own posts, admins can delete any
CREATE POLICY "posts_delete_own_or_admin"
    ON posts FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- 4. VERIFY POLICIES
-- ============================================

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('posts', 'comments')
ORDER BY tablename, cmd;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ COMMENTS AND DELETE POSTS FIXED!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Comments: Anyone can read, authenticated can create/edit/delete own';
    RAISE NOTICE 'Posts: Admins can delete any post';
END $$;
