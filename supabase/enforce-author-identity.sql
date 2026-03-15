-- ============================================================================
-- ENFORCE AUTHOR IDENTITY ON POSTS AND COMMENTS
-- No content without identity - every post/comment MUST have an author
-- ============================================================================

-- ============================================================================
-- STEP 1: UPDATE POSTS TABLE
-- ============================================================================

-- Add author_type column if not exists (should already exist from previous migrations)
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS author_type TEXT DEFAULT 'user';

-- Update constraint to include 'anon' type
ALTER TABLE public.posts
DROP CONSTRAINT IF EXISTS posts_author_type_check;

ALTER TABLE public.posts
ADD CONSTRAINT posts_author_type_check 
CHECK (author_type IN ('user', 'guest', 'anon'));

-- ============================================================================
-- STEP 2: CREATE AUTHOR ENFORCEMENT CONSTRAINT FOR POSTS
-- Every post MUST have either user_id OR guest_id, never both, never none
-- ============================================================================

-- First, fix any orphaned posts (set them to guest if they have no author)
-- This is a one-time cleanup

-- Create a system guest for truly orphaned posts
DO $$
DECLARE
    v_system_guest_id UUID;
BEGIN
    -- Check if system guest exists
    SELECT id INTO v_system_guest_id 
    FROM public.guests 
    WHERE fingerprint = 'SYSTEM_ORPHAN_GUEST';
    
    IF v_system_guest_id IS NULL THEN
        INSERT INTO public.guests (fingerprint, session_id, status, trust_score, flags)
        VALUES ('SYSTEM_ORPHAN_GUEST', 'system', 'active', 100, ARRAY['system'])
        RETURNING id INTO v_system_guest_id;
    END IF;
    
    -- Assign orphaned posts to system guest
    UPDATE public.posts 
    SET 
        guest_id = v_system_guest_id,
        author_type = 'guest'
    WHERE user_id IS NULL AND guest_id IS NULL;
    
    -- Assign orphaned comments to system guest
    UPDATE public.comments 
    SET guest_id = v_system_guest_id
    WHERE user_id IS NULL AND guest_id IS NULL;
END $$;

-- Now add the constraint
ALTER TABLE public.posts 
DROP CONSTRAINT IF EXISTS posts_require_author;

ALTER TABLE public.posts 
ADD CONSTRAINT posts_require_author 
CHECK (
    (user_id IS NOT NULL AND guest_id IS NULL) OR 
    (user_id IS NULL AND guest_id IS NOT NULL)
);

-- ============================================================================
-- STEP 3: CREATE AUTHOR ENFORCEMENT CONSTRAINT FOR COMMENTS
-- ============================================================================

ALTER TABLE public.comments 
DROP CONSTRAINT IF EXISTS comments_require_author;

ALTER TABLE public.comments 
ADD CONSTRAINT comments_require_author 
CHECK (
    (user_id IS NOT NULL AND guest_id IS NULL) OR 
    (user_id IS NULL AND guest_id IS NOT NULL)
);

-- ============================================================================
-- STEP 4: CREATE TRIGGER TO AUTO-SET AUTHOR TYPE
-- ============================================================================

CREATE OR REPLACE FUNCTION set_author_type()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        NEW.author_type := 'user';
    ELSIF NEW.guest_id IS NOT NULL THEN
        NEW.author_type := 'anon';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_post_author_type ON public.posts;
CREATE TRIGGER trigger_set_post_author_type
    BEFORE INSERT OR UPDATE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION set_author_type();

-- ============================================================================
-- STEP 5: CREATE VALIDATION FUNCTION
-- Ensures identity is valid before allowing content creation
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_content_author(
    p_user_id UUID DEFAULT NULL,
    p_guest_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_valid BOOLEAN := FALSE;
    v_guest_valid BOOLEAN := FALSE;
BEGIN
    -- Check if exactly one is provided
    IF (p_user_id IS NULL AND p_guest_id IS NULL) THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'No identity provided - either user_id or guest_id is required'
        );
    END IF;
    
    IF (p_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Both user_id and guest_id provided - only one is allowed'
        );
    END IF;
    
    -- Validate user if provided
    IF p_user_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM public.profiles 
            WHERE id = p_user_id
        ) INTO v_user_valid;
        
        IF NOT v_user_valid THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'Invalid user_id - user does not exist'
            );
        END IF;
        
        RETURN jsonb_build_object(
            'valid', true,
            'author_type', 'user',
            'author_id', p_user_id
        );
    END IF;
    
    -- Validate guest if provided
    IF p_guest_id IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM public.guests 
            WHERE id = p_guest_id 
              AND status NOT IN ('blocked', 'merged')
        ) INTO v_guest_valid;
        
        IF NOT v_guest_valid THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'Invalid guest_id - guest does not exist or is blocked/merged'
            );
        END IF;
        
        RETURN jsonb_build_object(
            'valid', true,
            'author_type', 'anon',
            'author_id', p_guest_id
        );
    END IF;
    
    -- Should never reach here
    RETURN jsonb_build_object(
        'valid', false,
        'error', 'Unknown validation error'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_content_author TO anon, authenticated;

-- ============================================================================
-- STEP 6: UPDATE EXISTING POSTS TO SET CORRECT AUTHOR_TYPE
-- ============================================================================

UPDATE public.posts 
SET author_type = 'user' 
WHERE user_id IS NOT NULL AND (author_type IS NULL OR author_type != 'user');

UPDATE public.posts 
SET author_type = 'anon' 
WHERE guest_id IS NOT NULL AND (author_type IS NULL OR author_type NOT IN ('guest', 'anon'));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON CONSTRAINT posts_require_author ON public.posts IS 'Every post must have exactly one author: user_id XOR guest_id';
COMMENT ON CONSTRAINT comments_require_author ON public.comments IS 'Every comment must have exactly one author: user_id XOR guest_id';

SELECT 'Author identity enforcement complete!' AS status;
