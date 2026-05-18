-- =============================================
-- Retroactive Guest Post Matching
-- When a guest revisits, match their old posts by IP
-- =============================================

-- This function is called when a guest is created/updated
-- It looks for old anonymous posts that:
-- 1. Have no user_id and no guest_id
-- 2. Were created from the same IP as this guest
-- And claims them for the guest

CREATE OR REPLACE FUNCTION claim_posts_for_guest(
    p_guest_id UUID,
    p_real_ip TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_claimed_count INTEGER := 0;
BEGIN
    -- Skip if no IP provided
    IF p_real_ip IS NULL OR p_real_ip = '' THEN
        RETURN 0;
    END IF;
    
    -- Find and claim posts created from this IP that have no guest_id
    -- We use a subquery to find posts IDs first, then update
    WITH posts_to_claim AS (
        SELECT p.id
        FROM posts p
        WHERE p.user_id IS NULL
        AND p.guest_id IS NULL
        -- Match by IP from ip_security_logs
        AND EXISTS (
            SELECT 1 FROM ip_security_logs isl
            WHERE isl.real_ip = p_real_ip
            AND (
                isl.guest_id = p_guest_id 
                OR isl.guest_id IS NULL
            )
        )
    )
    UPDATE posts
    SET guest_id = p_guest_id
    WHERE id IN (SELECT id FROM posts_to_claim);
    
    GET DIAGNOSTICS v_claimed_count = ROW_COUNT;
    
    -- Update the guest's post_count
    IF v_claimed_count > 0 THEN
        UPDATE guests
        SET post_count = post_count + v_claimed_count
        WHERE id = p_guest_id;
    END IF;
    
    RETURN v_claimed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_posts_for_guest TO authenticated;
GRANT EXECUTE ON FUNCTION claim_posts_for_guest TO anon;

-- =============================================
-- Enhanced guest security logging with auto-claim
-- Call this after logging guest security to claim old posts
-- =============================================

CREATE OR REPLACE FUNCTION log_guest_security_with_claim(
    p_guest_id UUID,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ip TEXT;
    v_fingerprint TEXT;
    v_claimed_posts INTEGER := 0;
BEGIN
    -- Get real IP from server
    v_ip := get_request_ip();
    v_fingerprint := generate_ip_fingerprint(v_ip);
    
    -- Upsert security record
    INSERT INTO public.ip_security_logs (
        guest_id,
        real_ip,
        ip_fingerprint,
        country,
        city,
        isp,
        vpn_detected,
        last_seen_at
    )
    VALUES (
        p_guest_id,
        v_ip,
        v_fingerprint,
        p_country,
        p_city,
        p_isp,
        p_vpn_detected,
        NOW()
    )
    ON CONFLICT (guest_id) WHERE guest_id IS NOT NULL 
    DO UPDATE
    SET
        real_ip = v_ip,
        ip_fingerprint = v_fingerprint,
        country = COALESCE(EXCLUDED.country, ip_security_logs.country),
        city = COALESCE(EXCLUDED.city, ip_security_logs.city),
        isp = COALESCE(EXCLUDED.isp, ip_security_logs.isp),
        vpn_detected = EXCLUDED.vpn_detected,
        last_seen_at = NOW();
    
    -- Try to claim old posts by this IP
    v_claimed_posts := claim_posts_for_guest(p_guest_id, v_ip);
    
    RETURN jsonb_build_object(
        'success', true,
        'guest_id', p_guest_id,
        'claimed_posts', v_claimed_posts
    );
END;
$$;

GRANT EXECUTE ON FUNCTION log_guest_security_with_claim TO authenticated;
GRANT EXECUTE ON FUNCTION log_guest_security_with_claim TO anon;
