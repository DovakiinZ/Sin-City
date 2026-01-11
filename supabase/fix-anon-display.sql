-- ============================================================================
-- FIX ANONYMOUS DISPLAY: Hide ANON-ASEEL from public, show to admin only
-- ============================================================================
-- The specific identity (ANON-ASEEL) should ONLY be visible to admins via
-- the inspector badge. Regular users should just see "Anonymous".
-- ============================================================================

-- Step 1: Update all posts by ANON-ASEEL to show "Anonymous" publicly
-- The real identity is still tracked in guests.anonymous_id for admin view
UPDATE public.posts 
SET author_name = 'Anonymous'
WHERE guest_id = (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL')
  AND author_name = 'ANON-ASEEL';

-- Step 2: Update all comments by ANON-ASEEL the same way
UPDATE public.comments 
SET author_name = 'Anonymous'
WHERE guest_id = (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL')
  AND author_name = 'ANON-ASEEL';

-- Verify the changes
SELECT 'Posts updated:' as info;
SELECT id, title, author_name, guest_id 
FROM posts 
WHERE guest_id = (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL')
LIMIT 10;

SELECT 'Comments updated:' as info;
SELECT id, left(content, 50), author_name, guest_id 
FROM comments 
WHERE guest_id = (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL')
LIMIT 10;

-- Verify the guest record still has the identity
SELECT 'Guest identity intact:' as info;
SELECT id, anonymous_id, fingerprint, status 
FROM guests 
WHERE anonymous_id = 'ANON-ASEEL';

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ ANON-ASEEL posts are now "Anonymous" to public users';
    RAISE NOTICE '   Admin can still see the ANON-ASEEL identity via inspector badge';
    RAISE NOTICE '========================================';
END $$;
