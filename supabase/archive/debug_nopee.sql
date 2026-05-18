-- Debug script for Nopee/npnp issue

-- 1. Get the ID of the user 'npnp'
SELECT 'User: npnp' as check_type, id, username, display_name 
FROM profiles 
WHERE username ILIKE 'npnp';

-- 2. Get the user_id from posts by 'Nopee'
SELECT 'Post: Nopee' as check_type, id, user_id, author_name 
FROM posts 
WHERE author_name ILIKE '%Nopee%' 
LIMIT 5;

-- 3. Check if the ID from step 2 exists in profiles
SELECT 'Orphan Check' as check_type, id, username 
FROM profiles 
WHERE id IN (
    SELECT user_id FROM posts WHERE author_name ILIKE '%Nopee%'
);

-- 4. Fix RLS on profiles just in case (allow everyone to read profiles)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" 
ON profiles FOR SELECT 
USING ( true );
