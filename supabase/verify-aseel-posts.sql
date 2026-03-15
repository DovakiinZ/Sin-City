-- ============================================================================
-- VERIFY: ANON-ASEEL actual post count
-- ============================================================================

-- Get ANON-ASEEL guest ID
SELECT 'ANON-ASEEL guest record:' as info;
SELECT id, anonymous_id, post_count as stored_count, first_seen_at, last_seen_at
FROM guests 
WHERE anonymous_id = 'ANON-ASEEL';

-- Count ACTUAL posts linked to ANON-ASEEL
SELECT 'Actual posts in database:' as info;
SELECT COUNT(*) as actual_post_count
FROM posts 
WHERE guest_id = (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL');

-- Show the actual posts (first 20)
SELECT 'Posts by ANON-ASEEL (first 20):' as info;
SELECT id, LEFT(title, 50) as title, LEFT(content, 50) as content_preview, created_at
FROM posts 
WHERE guest_id = (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL')
ORDER BY created_at DESC
LIMIT 20;

-- Check if post_count is wrong and fix it
SELECT 'FIX: Updating post_count to actual value:' as info;
UPDATE guests 
SET post_count = (
    SELECT COUNT(*) FROM posts WHERE guest_id = guests.id
)
WHERE anonymous_id = 'ANON-ASEEL'
RETURNING anonymous_id, post_count as corrected_count;

-- Also check for orphaned posts that might be ANON-ASEEL's
SELECT 'Orphaned posts (no guest_id, author is Anonymous):' as info;
SELECT COUNT(*) as orphan_count
FROM posts 
WHERE user_id IS NULL 
  AND guest_id IS NULL 
  AND author_name = 'Anonymous';
