-- ============================================================================
-- FIX ANON-ASEEL: Create identity, link posts, and track visits
-- ============================================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Create dedicated guest record for ANON-ASEEL
-- ============================================================================

DO $$
DECLARE
    v_guest_id UUID;
    v_post_author_name TEXT;
    v_posts_updated INT := 0;
    v_comments_updated INT := 0;
BEGIN
    -- Get the author_name from the specified post
    SELECT author_name INTO v_post_author_name 
    FROM posts 
    WHERE id = 'bc8688ff-dfce-433b-b42d-21bd92815afc';
    
    RAISE NOTICE 'Current author_name on post: %', COALESCE(v_post_author_name, 'NULL');
    
    -- Check if ANON-ASEEL guest exists
    SELECT id INTO v_guest_id FROM public.guests WHERE anonymous_id = 'ANON-ASEEL';
    
    IF v_guest_id IS NULL THEN
        -- Create new guest for ANON-ASEEL with placeholder fingerprint
        -- The REAL fingerprint will be captured on her next visit
        INSERT INTO public.guests (
            fingerprint, 
            anonymous_id, 
            session_id, 
            status, 
            trust_score, 
            flags,
            notes
        ) VALUES (
            'PENDING-ASEEL-' || encode(gen_random_bytes(8), 'hex'),  -- Temporary until real fingerprint captured
            'ANON-ASEEL',
            'awaiting-fingerprint',
            'active',
            100,
            ARRAY['known_user', 'pending_fingerprint'],
            'Known user - fingerprint will be captured on next visit'
        )
        RETURNING id INTO v_guest_id;
        
        RAISE NOTICE 'Created new guest ANON-ASEEL with ID: %', v_guest_id;
    ELSE
        RAISE NOTICE 'Guest ANON-ASEEL already exists with ID: %', v_guest_id;
    END IF;
    
    -- ============================================================================
    -- STEP 2: Link the specific post to ANON-ASEEL
    -- ============================================================================
    
    UPDATE public.posts 
    SET 
        guest_id = v_guest_id,
        author_name = 'Anonymous',  -- Public display name (admin sees ANON-ASEEL via inspector)
        author_type = 'anon'
    WHERE id = 'bc8688ff-dfce-433b-b42d-21bd92815afc';
    
    RAISE NOTICE 'Updated specified post to ANON-ASEEL';
    
    -- ============================================================================
    -- STEP 3: Link ALL orphaned posts with the same author_name
    -- ============================================================================
    
    IF v_post_author_name IS NOT NULL AND v_post_author_name != '' THEN
        UPDATE public.posts 
        SET 
            guest_id = v_guest_id,
            author_name = 'Anonymous',  -- Public display name (admin sees ANON-ASEEL via inspector)
            author_type = 'anon'
        WHERE user_id IS NULL 
          AND (guest_id IS NULL OR guest_id = (SELECT id FROM guests WHERE fingerprint = 'SYSTEM_ORPHAN_GUEST'))
          AND LOWER(author_name) = LOWER(v_post_author_name);
        
        GET DIAGNOSTICS v_posts_updated = ROW_COUNT;
        RAISE NOTICE 'Updated % posts with author_name "%" to ANON-ASEEL', v_posts_updated, v_post_author_name;
    END IF;
    
    -- ============================================================================
    -- STEP 4: Link orphaned comments with the same author_name
    -- ============================================================================
    
    IF v_post_author_name IS NOT NULL AND v_post_author_name != '' THEN
        UPDATE public.comments 
        SET 
            guest_id = v_guest_id,
            author_name = 'Anonymous'  -- Public display name
        WHERE user_id IS NULL 
          AND guest_id IS NULL
          AND LOWER(author_name) = LOWER(v_post_author_name);
        
        GET DIAGNOSTICS v_comments_updated = ROW_COUNT;
        RAISE NOTICE 'Updated % comments to ANON-ASEEL', v_comments_updated;
    END IF;
    
    -- Update guest post count
    UPDATE public.guests 
    SET post_count = (SELECT COUNT(*) FROM posts WHERE guest_id = v_guest_id)
    WHERE id = v_guest_id;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ ANON-ASEEL identity created and linked!';
    RAISE NOTICE 'Guest ID: %', v_guest_id;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- STEP 5: Create function to capture ANON-ASEEL's fingerprint on visit
-- ============================================================================

CREATE OR REPLACE FUNCTION link_fingerprint_to_aseel(
    p_fingerprint TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_aseel_id UUID;
    v_old_fingerprint TEXT;
BEGIN
    -- Get ANON-ASEEL's guest ID
    SELECT id, fingerprint INTO v_aseel_id, v_old_fingerprint 
    FROM public.guests 
    WHERE anonymous_id = 'ANON-ASEEL';
    
    IF v_aseel_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ANON-ASEEL not found');
    END IF;
    
    -- Update fingerprint if it was pending
    IF v_old_fingerprint LIKE 'PENDING-ASEEL-%' THEN
        UPDATE public.guests 
        SET 
            fingerprint = p_fingerprint,
            device_info = p_device_info,
            flags = array_remove(flags, 'pending_fingerprint'),
            notes = 'Fingerprint captured on ' || NOW()::TEXT,
            last_seen_at = NOW()
        WHERE id = v_aseel_id;
        
        -- Log the fingerprint capture
        INSERT INTO public.activity_logs (
            actor_type, actor_id, action, 
            target_metadata, ip_address
        ) VALUES (
            'anon', v_aseel_id, 'identity_resolve',
            jsonb_build_object(
                'event', 'fingerprint_captured',
                'fingerprint', p_fingerprint,
                'timestamp', NOW()
            ),
            p_ip_address
        );
        
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Fingerprint captured for ANON-ASEEL',
            'guest_id', v_aseel_id,
            'fingerprint', p_fingerprint
        );
    ELSE
        -- Already has fingerprint, just update last_seen
        UPDATE public.guests 
        SET last_seen_at = NOW()
        WHERE id = v_aseel_id;
        
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'ANON-ASEEL already has fingerprint',
            'current_fingerprint', v_old_fingerprint
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION link_fingerprint_to_aseel TO anon, authenticated;

-- ============================================================================
-- STEP 6: Create admin view for ANON-ASEEL activity
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_check_aseel_visits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guest RECORD;
    v_visits JSONB;
    v_posts JSONB;
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    
    -- Get ANON-ASEEL guest record
    SELECT * INTO v_guest 
    FROM public.guests 
    WHERE anonymous_id = 'ANON-ASEEL';
    
    IF v_guest IS NULL THEN
        RETURN jsonb_build_object('error', 'ANON-ASEEL not found');
    END IF;
    
    -- Get recent activity logs
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'action', al.action,
            'ip', al.ip_address,
            'metadata', al.target_metadata,
            'timestamp', al.created_at
        ) ORDER BY al.created_at DESC
    ), '[]'::jsonb) INTO v_visits
    FROM public.activity_logs al
    WHERE al.actor_type = 'anon' AND al.actor_id = v_guest.id
    LIMIT 50;
    
    -- Get posts
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'title', p.title,
            'created_at', p.created_at
        ) ORDER BY p.created_at DESC
    ), '[]'::jsonb) INTO v_posts
    FROM public.posts p
    WHERE p.guest_id = v_guest.id;
    
    RETURN jsonb_build_object(
        'guest_id', v_guest.id,
        'anonymous_id', v_guest.anonymous_id,
        'fingerprint', v_guest.fingerprint,
        'status', v_guest.status,
        'first_seen', v_guest.first_seen_at,
        'last_seen', v_guest.last_seen_at,
        'post_count', v_guest.post_count,
        'device_info', v_guest.device_info,
        'ip_history', v_guest.ip_history,
        'recent_activity', v_visits,
        'posts', v_posts
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_check_aseel_visits TO authenticated;

-- ============================================================================
-- VERIFY: Show ANON-ASEEL guest and their posts
-- ============================================================================

SELECT 'ANON-ASEEL Guest Record:' as info;
SELECT 
    id, 
    anonymous_id, 
    anon_token,
    fingerprint, 
    status, 
    post_count,
    flags,
    first_seen_at,
    last_seen_at
FROM public.guests 
WHERE anonymous_id = 'ANON-ASEEL';

SELECT 'Posts by ANON-ASEEL:' as info;
SELECT id, title, author_name, guest_id, created_at 
FROM posts 
WHERE guest_id = (SELECT id FROM guests WHERE anonymous_id = 'ANON-ASEEL')
ORDER BY created_at DESC
LIMIT 10;

-- Show the specific post
SELECT 'Target Post:' as info;
SELECT id, title, author_name, guest_id, user_id, author_type
FROM posts 
WHERE id = 'bc8688ff-dfce-433b-b42d-21bd92815afc';

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ ANON-ASEEL SETUP COMPLETE!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'To check ANON-ASEEL activity, run:';
    RAISE NOTICE '  SELECT admin_check_aseel_visits();';
    RAISE NOTICE '========================================';
END $$;

