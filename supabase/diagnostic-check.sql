-- Diagnostic SQL to check database state and identify issues
-- Run this in Supabase SQL Editor to see what's wrong

-- ============================================================================
-- 1. CHECK IF TABLES EXIST
-- ============================================================================
SELECT 
    'Tables Check' as check_type,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') as profiles_exists,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') as posts_exists,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'music_links') as music_links_exists,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comments') as comments_exists;

-- ============================================================================
-- 2. CHECK IF ROLE COLUMN EXISTS IN PROFILES
-- ============================================================================
SELECT 
    'Role Column Check' as check_type,
    EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) as role_column_exists;

-- ============================================================================
-- 3. LIST ALL USERS AND THEIR ROLES
-- ============================================================================
SELECT 
    id,
    username,
    COALESCE(role, 'NO ROLE COLUMN') as role,
    created_at
FROM public.profiles
ORDER BY created_at;

-- ============================================================================
-- 4. CHECK RLS POLICIES ON POSTS TABLE
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'posts'
ORDER BY policyname;

-- ============================================================================
-- 5. CHECK RLS POLICIES ON MUSIC_LINKS TABLE
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'music_links'
ORDER BY policyname;

-- ============================================================================
-- 6. CHECK RLS POLICIES ON PROFILES TABLE
-- ============================================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- ============================================================================
-- 7. COUNT POSTS
-- ============================================================================
SELECT 
    'Posts Count' as check_type,
    COUNT(*) as total_posts,
    COUNT(*) FILTER (WHERE draft = true) as draft_posts,
    COUNT(*) FILTER (WHERE draft = false) as published_posts
FROM public.posts;

-- ============================================================================
-- 8. COUNT MUSIC LINKS
-- ============================================================================
SELECT 
    'Music Links Count' as check_type,
    COUNT(*) as total_music_links,
    COUNT(*) FILTER (WHERE is_active = true) as active_links,
    COUNT(*) FILTER (WHERE is_active = false) as inactive_links
FROM public.music_links;

-- ============================================================================
-- 9. CHECK IF CURRENT USER IS ADMIN (run when logged in)
-- ============================================================================
SELECT 
    'Current User Check' as check_type,
    auth.uid() as current_user_id,
    (SELECT username FROM public.profiles WHERE id = auth.uid()) as username,
    (SELECT role FROM public.profiles WHERE id = auth.uid()) as role,
    public.is_admin(auth.uid()) as is_admin_function_result;

-- ============================================================================
-- 10. CHECK MUSIC_LINKS TABLE STRUCTURE
-- ============================================================================
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'music_links'
ORDER BY ordinal_position;
