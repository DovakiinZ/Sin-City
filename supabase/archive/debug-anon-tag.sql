-- CHECK: Why is the yellow tag not showing?
-- The tag needs: guest_id AND guests.anonymous_id

-- 1. Check posts that have guest_id
SELECT 'Posts with guest_id:' as info;
SELECT p.id, p.title, p.author_name, p.guest_id, g.anonymous_id
FROM posts p
LEFT JOIN guests g ON p.guest_id = g.id
WHERE p.user_id IS NULL
ORDER BY p.created_at DESC
LIMIT 10;

-- 2. Check the ANON-ASEEL guest record
SELECT 'ANON-ASEEL guest record:' as info;
SELECT id, anonymous_id, fingerprint, status
FROM guests 
WHERE anonymous_id = 'ANON-ASEEL';

-- 3. Find posts that SHOULD be linked to ANON-ASEEL
SELECT 'Posts that should be ANON-ASEEL (check guest_id match):' as info;
SELECT p.id, p.title, p.author_name, p.guest_id,
       (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL') as expected_guest_id
FROM posts p
WHERE p.user_id IS NULL
  AND (p.author_name = 'Anonymous' OR p.author_name = 'ANON-ASEEL')
ORDER BY p.created_at DESC
LIMIT 10;
