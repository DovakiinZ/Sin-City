-- Fix profiles table for avatar storage
-- Run this in Supabase SQL Editor

-- Add avatar_url column if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Also ensure the posts table has author_avatar column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_avatar TEXT;

-- Update RLS to allow users to update their own avatar
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;

CREATE POLICY "profiles_update_own_or_admin"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id 
    OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    auth.uid() = id 
    OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name IN ('avatar_url', 'role');

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'posts' AND column_name = 'author_avatar';

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ AVATAR COLUMNS ADDED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'profiles.avatar_url - for user profile pictures';
  RAISE NOTICE 'posts.author_avatar - for post author pictures';
END $$;
