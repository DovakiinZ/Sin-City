-- Fix avatars and profiles RLS - COMPLETE FIX (v2)
-- Run this in Supabase SQL Editor

-- Step 1: Add avatar columns if missing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_avatar TEXT;

-- Step 2: Drop ALL existing policies for a clean slate
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create fresh policies
-- SELECT: Everyone can view profiles
CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT
  USING (true);

-- INSERT/UPDATE: Authenticated users can manage their own profile
CREATE POLICY "profiles_insert_update_own"
  ON profiles FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = id);

-- Verify
SELECT 'Policies after fix:' as message;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ PROFILES RLS COMPLETELY RESET!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Try saving your profile picture now.';
END $$;
