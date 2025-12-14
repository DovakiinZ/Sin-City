-- Global Fix for Profiles Table RLS
-- Run this to ensure ALL profiles are publicly readable

-- 1. Enable RLS (if not already)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- 3. Create PERMISSIVE policies

-- SELECT: deeply permission - everyone can read everything
CREATE POLICY "Public profiles are viewable by everyone" 
ON profiles FOR SELECT 
USING ( true );

-- INSERT: Authenticated users can insert their own profile
CREATE POLICY "Users can insert their own profile" 
ON profiles FOR INSERT 
WITH CHECK ( auth.uid() = id );

-- UPDATE: Users can update their own profile
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING ( auth.uid() = id );

-- 4. Verify
SELECT * FROM pg_policies WHERE tablename = 'profiles';
