-- Diagnostic: Find posts with missing profile links

-- 1. Show posts where user_id exists but no matching profile
SELECT 
    p.id AS post_id,
    p.title,
    p.author_name,
    p.user_id,
    p.author_email
FROM posts p
LEFT JOIN profiles pr ON p.user_id = pr.id
WHERE p.user_id IS NOT NULL 
  AND pr.id IS NULL;

-- 2. Show all profiles (id and username only - no email column exists)
SELECT id, username FROM profiles;

-- 3. Show auth users to compare with profiles
-- The profiles.id should match auth.users.id
SELECT id, email FROM auth.users;

-- 4. Find posts with user_ids that match auth.users but not profiles
-- This means the profile wasn't created for that user
SELECT 
    p.title,
    p.author_name,
    p.user_id,
    au.email AS auth_email
FROM posts p
JOIN auth.users au ON p.user_id = au.id
LEFT JOIN profiles pr ON p.user_id = pr.id
WHERE pr.id IS NULL;

-- 5. FIX: Create missing profiles for users who have posts but no profile
-- First, let's see what profiles need to be created
INSERT INTO profiles (id, username)
SELECT DISTINCT 
    p.user_id,
    SPLIT_PART(au.email, '@', 1) AS username
FROM posts p
JOIN auth.users au ON p.user_id = au.id
LEFT JOIN profiles pr ON p.user_id = pr.id
WHERE pr.id IS NULL
  AND p.user_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 6. Now update posts to use the correct username
UPDATE posts
SET author_name = profiles.username
FROM profiles
WHERE posts.user_id = profiles.id
  AND profiles.username IS NOT NULL;

-- 7. Verify the fix
SELECT 
    p.title,
    p.author_name AS "Post Author",
    pr.username AS "Profile Username",
    CASE 
        WHEN p.author_name = pr.username THEN '✓ Fixed'
        ELSE '✗ Still Broken'
    END AS "Status"
FROM posts p
LEFT JOIN profiles pr ON p.user_id = pr.id
WHERE p.user_id IS NOT NULL
ORDER BY p.created_at DESC;