-- Sync auth.users to profiles table (handles duplicate usernames)
-- Run this in Supabase SQL Editor

-- Step 1: Ensure role column exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Step 2: Insert missing users with unique usernames (append user ID suffix for duplicates)
INSERT INTO profiles (id, username, role, created_at)
SELECT 
    u.id,
    COALESCE(u.raw_user_meta_data->>'displayName', split_part(u.email, '@', 1)) || '_' || LEFT(u.id::text, 4) as username,
    'user' as role,
    u.created_at
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Verify all users are now in profiles
SELECT 
    p.id,
    p.username,
    p.role,
    u.email,
    p.created_at
FROM profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.created_at DESC;

-- Show count
SELECT COUNT(*) as total_users FROM profiles;
