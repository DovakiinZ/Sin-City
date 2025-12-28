-- =====================================================
-- FIX: Anonymous ID Visibility for Admin Post Views
-- =====================================================
-- This enables admins to see anonymous_id when viewing posts
-- and allows old posts to be linked to returning guests

-- 1. Add RLS policy to allow reading guest anonymous_id
-- (This enables the posts -> guests join to work)
DROP POLICY IF EXISTS "Allow reading guest anonymous_id for posts" ON public.guests;
CREATE POLICY "Allow reading guest anonymous_id for posts"
ON public.guests
FOR SELECT
USING (true);

-- 2. Create function to link old posts to returning guests
-- When a guest with a known fingerprint creates a new post, 
-- we can link their old orphan posts by matching author patterns
CREATE OR REPLACE FUNCTION link_guest_to_old_posts(
    p_guest_id UUID,
    p_fingerprint TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- Link posts that:
    -- 1. Have no guest_id (orphaned anonymous posts)
    -- 2. Have no user_id (truly anonymous)
    -- 3. Were created from similar session (we can't perfectly match, but we can link recent orphans)
    
    -- For now, we just provide the function - actual matching would need more data
    -- This is a placeholder for future fingerprint-based matching
    
    UPDATE public.posts
    SET guest_id = p_guest_id
    WHERE user_id IS NULL 
      AND guest_id IS NULL
      AND created_at >= NOW() - INTERVAL '1 day'  -- Only recent posts from same session
      AND (author_name IS NULL OR author_name = 'Anonymous' OR author_name = '');
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

-- 3. Ensure all guests have anonymous_id (backfill any that don't)
UPDATE public.guests
SET anonymous_id = 'ANON-' || UPPER(SUBSTRING(MD5(id::text) FROM 1 FOR 6))
WHERE anonymous_id IS NULL;

-- 4. Grant execute permission on the linking function
GRANT EXECUTE ON FUNCTION link_guest_to_old_posts(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION link_guest_to_old_posts(UUID, TEXT) TO anon;

-- Verify the changes
SELECT 'RLS Policy added for guests table' as status;
SELECT COUNT(*) as guests_with_anon_id FROM public.guests WHERE anonymous_id IS NOT NULL;
