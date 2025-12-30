-- Anonymous ID Schema for Guest Tracking
-- This adds human-readable ANON-XXXXXX identifiers for admin visibility
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: ADD ANONYMOUS_ID COLUMN TO GUESTS TABLE
-- ============================================================================

ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS anonymous_id TEXT UNIQUE;

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_guests_anonymous_id ON public.guests(anonymous_id) WHERE anonymous_id IS NOT NULL;

-- ============================================================================
-- STEP 2: CREATE TRIGGER FOR AUTO-GENERATION
-- ============================================================================

-- Function to generate ANON-XXXXXX format ID from UUID
CREATE OR REPLACE FUNCTION generate_anonymous_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate 6-character hex from MD5 of the UUID
    IF NEW.anonymous_id IS NULL THEN
        NEW.anonymous_id := 'ANON-' || UPPER(SUBSTRING(MD5(NEW.id::text) FROM 1 FOR 6));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trigger_generate_anonymous_id ON public.guests;
CREATE TRIGGER trigger_generate_anonymous_id
    BEFORE INSERT ON public.guests
    FOR EACH ROW
    EXECUTE FUNCTION generate_anonymous_id();

-- ============================================================================
-- STEP 3: BACKFILL EXISTING GUESTS
-- ============================================================================

UPDATE public.guests 
SET anonymous_id = 'ANON-' || UPPER(SUBSTRING(MD5(id::text) FROM 1 FOR 6))
WHERE anonymous_id IS NULL;

-- ============================================================================
-- STEP 4: ADD GUEST_ID TO COMMENTS (for future guest comments)
-- ============================================================================

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_comments_guest_id ON public.comments(guest_id) WHERE guest_id IS NOT NULL;

-- ============================================================================
-- STEP 5: UPDATE GET_GUEST_POSTS FUNCTION TO INCLUDE COMMENTS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_guest_activity(p_guest_id UUID)
RETURNS TABLE (
    item_id UUID,
    item_type TEXT,
    title TEXT,
    content TEXT,
    post_slug TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;
    
    RETURN QUERY
    -- Posts
    SELECT 
        p.id as item_id,
        'post'::TEXT as item_type,
        p.title,
        LEFT(p.content, 100) as content,
        p.slug as post_slug,
        p.created_at
    FROM public.posts p
    WHERE p.guest_id = p_guest_id
    
    UNION ALL
    
    -- Comments
    SELECT 
        c.id as item_id,
        'comment'::TEXT as item_type,
        NULL as title,
        LEFT(c.content, 100) as content,
        c.post_id::TEXT as post_slug,
        c.created_at
    FROM public.comments c
    WHERE c.guest_id = p_guest_id
    
    ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_guest_activity TO authenticated;

-- ============================================================================
-- DONE!
-- ============================================================================

SELECT 'Anonymous ID schema created successfully!' as status;
SELECT COUNT(*) as guests_with_anon_id FROM public.guests WHERE anonymous_id IS NOT NULL;
