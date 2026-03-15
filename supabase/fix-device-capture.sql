-- ============================================================================
-- FIX: Ensure device info is captured on EVERY visit (regardless of match type)
-- ============================================================================
-- The current function only updates device_info on token match.
-- This fix ensures device info is updated on fingerprint match too.
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
    p_tor_detected BOOLEAN DEFAULT FALSE,
    p_legacy_guest_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guest RECORD;
    v_new_guest_id UUID;
BEGIN
    -- ========================================================
    -- PRIORITY 1: Token match (highest priority)
    -- ========================================================
    IF p_anon_token IS NOT NULL AND p_anon_token != '' THEN
        SELECT * INTO v_guest 
        FROM public.guests 
        WHERE anon_token = p_anon_token
          AND status != 'merged'
          AND merged_user_id IS NULL;
        
        IF FOUND THEN
            -- Update IP history
            BEGIN 
                PERFORM update_guest_ip_history(v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp);
            EXCEPTION WHEN OTHERS THEN NULL; 
            END;
            
            -- ALWAYS update device info on every visit
            UPDATE public.guests SET
                session_id = COALESCE(p_session_id, session_id),
                device_info = CASE 
                    WHEN p_device_info IS NOT NULL AND p_device_info != '{}'::jsonb 
                    THEN p_device_info 
                    ELSE device_info 
                END,
                country = COALESCE(p_country, country),
                city = COALESCE(p_city, city),
                isp = COALESCE(p_isp, isp),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
                tor_detected = COALESCE(p_tor_detected, tor_detected),
                last_seen_at = NOW()
            WHERE id = v_guest.id
            RETURNING * INTO v_guest;
            
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

    -- ========================================================
    -- PRIORITY 2: Legacy guest ID match (for migration)
    -- ========================================================
    IF p_legacy_guest_id IS NOT NULL THEN
        SELECT * INTO v_guest FROM public.guests 
        WHERE id = p_legacy_guest_id 
          AND status != 'merged' 
          AND merged_user_id IS NULL;
          
        IF FOUND THEN
            -- Generate token if missing, update fingerprint and device info
            UPDATE public.guests SET 
                anon_token = COALESCE(anon_token, encode(gen_random_bytes(32), 'hex')),
                fingerprint = COALESCE(p_fingerprint, fingerprint), 
                device_info = CASE 
                    WHEN p_device_info IS NOT NULL AND p_device_info != '{}'::jsonb 
                    THEN p_device_info 
                    ELSE device_info 
                END,
                country = COALESCE(p_country, country),
                city = COALESCE(p_city, city),
                isp = COALESCE(p_isp, isp),
                last_seen_at = NOW()
            WHERE id = v_guest.id
            RETURNING * INTO v_guest;

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
                'match_type', 'legacy_migration'
            );
        END IF;
    END IF;
    
    -- ========================================================
    -- PRIORITY 3: Fingerprint match
    -- ========================================================
    IF p_fingerprint IS NOT NULL AND p_fingerprint != '' THEN
        SELECT * INTO v_guest FROM public.guests 
        WHERE fingerprint = p_fingerprint 
          AND status != 'merged' 
          AND merged_user_id IS NULL;
        
        IF FOUND THEN
            -- Update IP history
            BEGIN 
                PERFORM update_guest_ip_history(v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp);
            EXCEPTION WHEN OTHERS THEN NULL; 
            END;
            
            -- ALWAYS update device info and geo data on every visit
            UPDATE public.guests SET
                session_id = COALESCE(p_session_id, session_id),
                device_info = CASE 
                    WHEN p_device_info IS NOT NULL AND p_device_info != '{}'::jsonb 
                    THEN p_device_info 
                    ELSE device_info 
                END,
                country = COALESCE(p_country, country),
                city = COALESCE(p_city, city),
                isp = COALESCE(p_isp, isp),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
                tor_detected = COALESCE(p_tor_detected, tor_detected),
                last_seen_at = NOW()
            WHERE id = v_guest.id
            RETURNING * INTO v_guest;
            
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
    
    -- ========================================================
    -- No match found: Create new guest
    -- ========================================================
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
        flags
    ) VALUES (
        COALESCE(p_fingerprint, 'unknown-' || encode(gen_random_bytes(16), 'hex')),
        p_session_id, 
        p_device_info, 
        p_ip_hash, 
        p_country, 
        p_city, 
        p_isp,
        p_vpn_detected,
        p_tor_detected,
        ARRAY['new']
    )
    RETURNING * INTO v_guest;
    
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION resolve_anon_identity TO anon, authenticated;

-- Verify
SELECT 'Function updated successfully' as info;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ resolve_anon_identity FIXED!';
    RAISE NOTICE 'Now captures device_info on EVERY visit';
    RAISE NOTICE '(token match, fingerprint match, and new)';
    RAISE NOTICE '========================================';
END $$;
