-- Re-enable RLS with FULLY OPEN policies
-- Sometimes disabling RLS completely causes issues with CORS
-- Run this in Supabase SQL Editor

-- =====================================================
-- POSTS TABLE
-- =====================================================
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow all on posts" ON posts;
DROP POLICY IF EXISTS "Anyone can insert posts" ON posts;
DROP POLICY IF EXISTS "Anyone can read posts" ON posts;
DROP POLICY IF EXISTS "Users can update own posts" ON posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;

-- Create a single policy that allows EVERYTHING
CREATE POLICY "Allow all on posts" ON posts 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- =====================================================
-- PROFILES TABLE
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow all on profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Create a single policy that allows EVERYTHING
CREATE POLICY "Allow all on profiles" ON profiles 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- =====================================================
-- COMMENTS TABLE (if exists)
-- =====================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'comments') THEN
        EXECUTE 'ALTER TABLE comments ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all on comments" ON comments';
        EXECUTE 'CREATE POLICY "Allow all on comments" ON comments FOR ALL TO public USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- =====================================================
-- MUSIC_LINKS TABLE (if exists)
-- =====================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'music_links') THEN
        EXECUTE 'ALTER TABLE music_links ENABLE ROW LEVEL SECURITY';
        EXECUTE 'DROP POLICY IF EXISTS "Allow all on music_links" ON music_links';
        EXECUTE 'CREATE POLICY "Allow all on music_links" ON music_links FOR ALL TO public USING (true) WITH CHECK (true)';
    END IF;
END $$;

-- =====================================================
-- VERIFY
-- =====================================================
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename IN ('posts', 'profiles', 'comments', 'music_links');

SELECT 'SUCCESS: RLS enabled with open policies. Try the app now!' as result;
