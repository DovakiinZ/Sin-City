-- ============================================================================
-- MERGE ANONYMOUS USER TO REGISTERED USER
-- Transfers all content and history when an anon registers
-- THIS IS IRREVERSIBLE!
-- ============================================================================

-- ============================================================================
-- MAIN MERGE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_anon_to_user(
    p_anon_id UUID,
    p_user_id UUID,
    p_admin_initiated BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_anon RECORD;
    v_user RECORD;
    v_posts_merged INT := 0;
    v_comments_merged INT := 0;
    v_likes_merged INT := 0;
    v_dms_merged INT := 0;
    v_activity_merged INT := 0;
    v_admin_id UUID;
BEGIN
    -- =========================================================================
    -- VALIDATION
    -- =========================================================================
    
    -- Get and validate anon
    SELECT * INTO v_anon FROM public.guests WHERE id = p_anon_id;
    
    IF v_anon IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Anonymous user not found',
            'anon_id', p_anon_id
        );
    END IF;
    
    IF v_anon.merged_user_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Anonymous user already merged',
            'anon_id', p_anon_id,
            'already_merged_to', v_anon.merged_user_id
        );
    END IF;
    
    IF v_anon.status = 'merged' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Anonymous user status is already merged',
            'anon_id', p_anon_id
        );
    END IF;
    
    -- Get and validate user
    SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;
    
    IF v_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found',
            'user_id', p_user_id
        );
    END IF;
    
    -- If admin-initiated, verify caller is admin
    IF p_admin_initiated THEN
        v_admin_id := auth.uid();
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_admin_id AND role = 'admin'
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Admin privileges required for admin-initiated merge'
            );
        END IF;
    END IF;
    
    -- =========================================================================
    -- TRANSFER CONTENT
    -- =========================================================================
    
    -- 1. Transfer POSTS
    UPDATE public.posts 
    SET 
        user_id = p_user_id,
        guest_id = NULL,
        author_type = 'user'
    WHERE guest_id = p_anon_id;
    GET DIAGNOSTICS v_posts_merged = ROW_COUNT;
    
    -- 2. Transfer COMMENTS
    UPDATE public.comments 
    SET 
        user_id = p_user_id,
        guest_id = NULL
    WHERE guest_id = p_anon_id;
    GET DIAGNOSTICS v_comments_merged = ROW_COUNT;
    
    -- 3. Transfer LIKES (if table exists)
    BEGIN
        UPDATE public.likes 
        SET user_id = p_user_id
        WHERE guest_id = p_anon_id;
        GET DIAGNOSTICS v_likes_merged = ROW_COUNT;
    EXCEPTION WHEN undefined_table THEN
        v_likes_merged := 0;
    END;
    
    -- 4. Transfer DIRECT MESSAGES (if applicable)
    BEGIN
        -- Update messages where anon was sender
        UPDATE public.messages 
        SET sender_id = p_user_id
        WHERE sender_id = p_anon_id::TEXT;
        GET DIAGNOSTICS v_dms_merged = ROW_COUNT;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
        v_dms_merged := 0;
    END;
    
    -- 5. Update ACTIVITY LOGS
    UPDATE public.activity_logs 
    SET 
        actor_id = p_user_id,
        actor_type = 'user'
    WHERE actor_type = 'anon' AND actor_id = p_anon_id;
    GET DIAGNOSTICS v_activity_merged = ROW_COUNT;
    
    -- =========================================================================
    -- MARK ANON AS MERGED (IRREVERSIBLE!)
    -- =========================================================================
    
    UPDATE public.guests 
    SET 
        merged_user_id = p_user_id,
        merged_at = NOW(),
        status = 'merged'
    WHERE id = p_anon_id;
    
    -- =========================================================================
    -- LOG THE MERGE EVENT
    -- =========================================================================
    
    INSERT INTO public.activity_logs (
        actor_type, actor_id, action,
        target_type, target_id, target_metadata
    ) VALUES (
        'user', p_user_id, 'merge',
        'anon', p_anon_id,
        jsonb_build_object(
            'posts_merged', v_posts_merged,
            'comments_merged', v_comments_merged,
            'likes_merged', v_likes_merged,
            'dms_merged', v_dms_merged,
            'activity_logs_merged', v_activity_merged,
            'admin_initiated', p_admin_initiated,
            'admin_id', v_admin_id,
            'anon_fingerprint', v_anon.fingerprint,
            'anon_anonymous_id', v_anon.anonymous_id,
            'anon_trust_score', v_anon.trust_score,
            'anon_post_count', v_anon.post_count,
            'merged_at', NOW()
        )
    );
    
    -- =========================================================================
    -- RETURN SUCCESS
    -- =========================================================================
    
    RETURN jsonb_build_object(
        'success', true,
        'anon_id', p_anon_id,
        'anon_anonymous_id', v_anon.anonymous_id,
        'user_id', p_user_id,
        'username', v_user.username,
        'posts_merged', v_posts_merged,
        'comments_merged', v_comments_merged,
        'likes_merged', v_likes_merged,
        'dms_merged', v_dms_merged,
        'activity_logs_merged', v_activity_merged,
        'total_merged', v_posts_merged + v_comments_merged + v_likes_merged + v_dms_merged,
        'merged_at', NOW(),
        'reversible', false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_anon_to_user TO authenticated;

-- ============================================================================
-- AUTO-MERGE ON REGISTRATION
-- Called when a user registers to check for existing anon identity
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_merge_on_registration(
    p_user_id UUID,
    p_anon_token TEXT DEFAULT NULL,
    p_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_anon_id UUID;
BEGIN
    -- Try to find anon by token first
    IF p_anon_token IS NOT NULL AND p_anon_token != '' THEN
        SELECT id INTO v_anon_id 
        FROM public.guests 
        WHERE anon_token = p_anon_token
          AND merged_user_id IS NULL
          AND status != 'merged';
    END IF;
    
    -- If no token match, try fingerprint
    IF v_anon_id IS NULL AND p_fingerprint IS NOT NULL AND p_fingerprint != '' THEN
        SELECT id INTO v_anon_id 
        FROM public.guests 
        WHERE fingerprint = p_fingerprint
          AND merged_user_id IS NULL
          AND status != 'merged';
    END IF;
    
    -- If we found an anon, merge them
    IF v_anon_id IS NOT NULL THEN
        RETURN merge_anon_to_user(v_anon_id, p_user_id, FALSE);
    END IF;
    
    -- No anon found to merge
    RETURN jsonb_build_object(
        'success', true,
        'merged', false,
        'message', 'No anonymous identity found to merge'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_merge_on_registration TO authenticated;

-- ============================================================================
-- ADMIN MERGE COMMAND
-- For manual merge by admin (e.g., via terminal)
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_merge_anon_to_user(
    p_anon_identifier TEXT,  -- Can be UUID, anonymous_id, or fingerprint
    p_username TEXT          -- Username to merge to
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_anon_id UUID;
    v_user_id UUID;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized: Admin access required'
        );
    END IF;
    
    -- Find anon by various identifiers
    SELECT id INTO v_anon_id FROM public.guests 
    WHERE id::TEXT = p_anon_identifier
       OR anonymous_id = p_anon_identifier
       OR fingerprint = p_anon_identifier
    LIMIT 1;
    
    IF v_anon_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Anonymous user not found',
            'searched_for', p_anon_identifier
        );
    END IF;
    
    -- Find user by username
    SELECT id INTO v_user_id FROM public.profiles 
    WHERE username = p_username;
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found',
            'searched_for', p_username
        );
    END IF;
    
    -- Perform the merge
    RETURN merge_anon_to_user(v_anon_id, v_user_id, TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_merge_anon_to_user TO authenticated;

-- ============================================================================
-- GET MERGE HISTORY FOR A USER
-- ============================================================================

CREATE OR REPLACE FUNCTION get_merged_identities(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify caller is the user or admin
    IF auth.uid() != p_user_id AND NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'merged_identities', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'anon_id', g.id,
                    'anonymous_id', g.anonymous_id,
                    'fingerprint', g.fingerprint,
                    'merged_at', g.merged_at,
                    'post_count', g.post_count,
                    'trust_score', g.trust_score
                )
            ), '[]'::jsonb)
            FROM public.guests g
            WHERE g.merged_user_id = p_user_id
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_merged_identities TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION merge_anon_to_user IS 'IRREVERSIBLE: Transfers all content from anon to registered user';
COMMENT ON FUNCTION auto_merge_on_registration IS 'Automatically merge anon identity when user registers';
COMMENT ON FUNCTION admin_merge_anon_to_user IS 'Admin command to manually merge anon to user';

SELECT 'Merge system complete!' AS status;
