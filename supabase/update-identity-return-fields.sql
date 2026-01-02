-- ============================================================================
-- UPDATE IDENTITY RESOLUTION TO RETURN MORE FIELDS
-- We need post_count and email_verified for the email gate (spam prevention)
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_anon_identity(
    p_anon_token TEXT DEFAULT NULL,
    p_fingerprint TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb,
    p_ip_address TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guest RECORD;
    v_soft_link RECORD;
    v_new_guest_id UUID;
BEGIN
    -- =========================================================================
    -- CASE 1: Token provided - direct lookup
    -- =========================================================================
    IF p_anon_token IS NOT NULL AND p_anon_token != '' THEN
        SELECT * INTO v_guest 
        FROM public.guests 
        WHERE anon_token = p_anon_token
          AND status != 'merged'
          AND merged_user_id IS NULL;
        
        IF FOUND THEN
            -- Update activity and IP history
            PERFORM update_guest_ip_history(
                v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp
            );
            
            -- Update other fields
            UPDATE public.guests SET
                session_id = COALESCE(p_session_id, session_id),
                device_info = COALESCE(p_device_info, device_info),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
                tor_detected = COALESCE(p_tor_detected, tor_detected),
                last_seen_at = NOW()
            WHERE id = v_guest.id;
            
            RETURN jsonb_build_object(
                'success', true,
                'guest_id', v_guest.id,
                'anon_id', v_guest.anonymous_id,
                'anon_token', v_guest.anon_token,
                'status', v_guest.status,
                'trust_score', v_guest.trust_score,
                'post_count', v_guest.post_count,
                'email_verified', v_guest.email_verified,
                'is_new', false,
                'match_type', 'token'
            );
        END IF;
    END IF;
    
    -- =========================================================================
    -- CASE 2: No token or token not found - try fingerprint match
    -- =========================================================================
    IF p_fingerprint IS NOT NULL AND p_fingerprint != '' THEN
        SELECT * INTO v_guest 
        FROM public.guests 
        WHERE fingerprint = p_fingerprint
          AND status != 'merged'
          AND merged_user_id IS NULL;
        
        IF FOUND THEN
            -- Update activity and IP history
            PERFORM update_guest_ip_history(
                v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp
            );
            
            -- Update other fields
            UPDATE public.guests SET
                session_id = COALESCE(p_session_id, session_id),
                device_info = COALESCE(p_device_info, device_info),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
                tor_detected = COALESCE(p_tor_detected, tor_detected),
                last_seen_at = NOW()
            WHERE id = v_guest.id;
            
            RETURN jsonb_build_object(
                'success', true,
                'guest_id', v_guest.id,
                'anon_id', v_guest.anonymous_id,
                'anon_token', v_guest.anon_token,
                'status', v_guest.status,
                'trust_score', v_guest.trust_score,
                'post_count', v_guest.post_count,
                'email_verified', v_guest.email_verified,
                'is_new', false,
                'match_type', 'fingerprint'
            );
        END IF;
    END IF;
    
    -- =========================================================================
    -- CASE 3: Try soft-linking via IP
    -- =========================================================================
    SELECT * INTO v_soft_link
    FROM find_soft_linked_guest(p_fingerprint, p_ip_address, p_ip_hash);
    
    IF FOUND AND v_soft_link.confidence >= 70 THEN
        SELECT * INTO v_guest 
        FROM public.guests 
        WHERE id = v_soft_link.guest_id;
        
        IF FOUND THEN
            -- Update with new fingerprint (soft-link)
            UPDATE public.guests SET
                soft_linked_from = array_append(COALESCE(soft_linked_from, '{}'), v_guest.id),
                soft_link_trust_score = v_soft_link.confidence,
                fingerprint = COALESCE(p_fingerprint, fingerprint),
                session_id = COALESCE(p_session_id, session_id),
                last_seen_at = NOW()
            WHERE id = v_guest.id;
            
            -- Update IP history
            PERFORM update_guest_ip_history(
                v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp
            );
            
            RETURN jsonb_build_object(
                'success', true,
                'guest_id', v_guest.id,
                'anon_id', v_guest.anonymous_id,
                'anon_token', v_guest.anon_token,
                'status', v_guest.status,
                'trust_score', v_guest.trust_score,
                'post_count', v_guest.post_count,
                'email_verified', v_guest.email_verified,
                'is_new', false,
                'match_type', 'soft_link',
                'soft_link_confidence', v_soft_link.confidence
            );
        END IF;
    END IF;
    
    -- =========================================================================
    -- CASE 4: No match found - create new guest
    -- =========================================================================
    INSERT INTO public.guests (
        fingerprint,
        session_id,
        device_info,
        ip_hash,
        country,
        city,
        isp,
        vpn_detected,
        tor_detected,
        flags,
        ip_history
    ) VALUES (
        COALESCE(p_fingerprint, 'unknown-' || encode(gen_random_bytes(16), 'hex')),
        p_session_id,
        p_device_info,
        p_ip_hash,
        p_country,
        p_city,
        p_isp,
        COALESCE(p_vpn_detected, false),
        COALESCE(p_tor_detected, false),
        ARRAY['new'],
        CASE WHEN p_ip_address IS NOT NULL THEN
            jsonb_build_array(jsonb_build_object(
                'ip', p_ip_address,
                'ip_hash', p_ip_hash,
                'country', p_country,
                'city', p_city,
                'isp', p_isp,
                'seen_at', NOW()
            ))
        ELSE '[]'::jsonb END
    )
    RETURNING id INTO v_new_guest_id;
    
    -- Get the created guest
    SELECT * INTO v_guest FROM public.guests WHERE id = v_new_guest_id;
    
    -- Log the identity creation
    PERFORM log_activity(
        'anon', v_new_guest_id, 'identity_resolve',
        NULL, NULL, jsonb_build_object('is_new', true)
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'guest_id', v_guest.id,
        'anon_id', v_guest.anonymous_id,
        'anon_token', v_guest.anon_token,
        'status', v_guest.status,
        'trust_score', v_guest.trust_score,
        'post_count', 0,
        'email_verified', false,
        'is_new', true,
        'match_type', 'created'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_anon_identity TO anon, authenticated;

SELECT 'Updated identity resolution to return post_count and email_verified' AS status;
