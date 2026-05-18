-- COMPREHENSIVE FIX: All database issues
-- Run this ENTIRE script in Supabase SQL Editor

-- =====================================================
-- 1. FIX POSTS TABLE - Allow creating and reading posts
-- =====================================================

-- Drop all existing post policies
DROP POLICY IF EXISTS "Users can create their own posts" ON posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON posts;
DROP POLICY IF EXISTS "Anyone can view published posts" ON posts;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON posts;
DROP POLICY IF EXISTS "Enable read access for all users" ON posts;
DROP POLICY IF EXISTS "Allow public inserts" ON posts;
DROP POLICY IF EXISTS "Allow public reads" ON posts;
DROP POLICY IF EXISTS "Allow users to update own posts" ON posts;
DROP POLICY IF EXISTS "Allow users to delete own posts" ON posts;
DROP POLICY IF EXISTS "Admin can do anything" ON posts;

-- Enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Allow ANYONE to insert posts (including guests)
CREATE POLICY "Anyone can insert posts" ON posts FOR INSERT TO public WITH CHECK (true);

-- Allow ANYONE to read all posts
CREATE POLICY "Anyone can read posts" ON posts FOR SELECT TO public USING (true);

-- Allow authenticated users to update their own posts
CREATE POLICY "Users can update own posts" ON posts FOR UPDATE TO authenticated 
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete their own posts
CREATE POLICY "Users can delete own posts" ON posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Make user_id nullable for guest posts
ALTER TABLE posts ALTER COLUMN user_id DROP NOT NULL;

-- Add author_avatar column if missing
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_avatar TEXT;

-- =====================================================
-- 2. FIX PROFILES TABLE - Admin access and role column
-- =====================================================

-- Drop existing profile policies
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Add role column if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Allow anyone to read profiles
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT TO public USING (true);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- =====================================================
-- 3. SET YOUR USER AS ADMIN
-- Replace YOUR_EMAIL with your actual email
-- =====================================================

-- Method 1: Update by email (find user in auth.users, then update profile)
-- First, let's see all users and their roles:
-- SELECT p.id, u.email, p.role FROM profiles p JOIN auth.users u ON p.id = u.id;

-- To set yourself as admin, run ONE of these (replace email):
-- UPDATE profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com');

-- Or if you know your user ID:
-- UPDATE profiles SET role = 'admin' WHERE id = 'your-user-uuid-here';

-- =====================================================
-- 4. FIX COMMENTS TABLE
-- =====================================================

-- Drop existing comment policies
DROP POLICY IF EXISTS "Anyone can read comments" ON comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;

-- Enable RLS if table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'comments') THEN
        ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
        
        -- Allow anyone to read comments
        CREATE POLICY "Anyone can read comments" ON comments FOR SELECT TO public USING (true);
        
        -- Allow anyone to insert comments
        CREATE POLICY "Anyone can create comments" ON comments FOR INSERT TO public WITH CHECK (true);
        
        -- Allow users to update own comments
        CREATE POLICY "Users can update own comments" ON comments FOR UPDATE TO authenticated 
        USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        
        -- Allow users to delete own comments
        CREATE POLICY "Users can delete own comments" ON comments FOR DELETE TO authenticated 
        USING (auth.uid() = user_id);
    END IF;
END $$;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
SELECT 'All policies have been updated! Now set yourself as admin using the command above.' as message;
