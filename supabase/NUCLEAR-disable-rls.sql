-- NUCLEAR FIX: Disable RLS completely
-- This will allow EVERYTHING - use only to test if RLS is the problem
-- Run this in Supabase SQL Editor

-- =====================================================
-- DISABLE ALL RLS ON POSTS
-- =====================================================
ALTER TABLE posts DISABLE ROW LEVEL SECURITY;

-- Drop ALL policies on posts (clean slate)
DO $$ 
DECLARE 
    policy_name TEXT;
BEGIN
    FOR policy_name IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'posts'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON posts', policy_name);
    END LOOP;
END $$;

-- =====================================================
-- DISABLE ALL RLS ON PROFILES
-- =====================================================
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Drop ALL policies on profiles
DO $$ 
DECLARE 
    policy_name TEXT;
BEGIN
    FOR policy_name IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', policy_name);
    END LOOP;
END $$;

-- =====================================================
-- DISABLE ALL RLS ON COMMENTS (if exists)
-- =====================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'comments') THEN
        EXECUTE 'ALTER TABLE comments DISABLE ROW LEVEL SECURITY';
    END IF;
END $$;

-- =====================================================
-- ADD MISSING COLUMNS TO POSTS
-- =====================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_avatar TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS draft BOOLEAN DEFAULT false;

-- Make columns nullable
ALTER TABLE posts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE posts ALTER COLUMN content DROP NOT NULL;

-- =====================================================
-- CHECK TABLE STRUCTURE
-- =====================================================
SELECT 'Posts table columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'posts' 
ORDER BY ordinal_position;

-- Check if RLS is disabled
SELECT 'RLS Status:' as info;
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('posts', 'profiles', 'comments');

SELECT 'SUCCESS: RLS is now DISABLED. Try creating a post!' as result;
