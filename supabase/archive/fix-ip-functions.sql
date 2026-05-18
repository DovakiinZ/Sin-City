-- =====================================================
-- STEP 2: Create IP logging functions
-- Run this AFTER fix-ip-columns.sql succeeds
-- =====================================================

-- Drop old function signatures
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

-- Create log_guest_security function
CREATE OR REPLACE FUNCTION log_guest_security(
    p_guest_id UUID,
    p_ip_hash TEXT DEFAULT NULL,
    p_ip_encrypted TEXT DEFAULT NULL,
    p_ip_source TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.guests
    SET 
        ip_hash = COALESCE(p_ip_hash, ip_hash),
        ip_encrypted = COALESCE(p_ip_encrypted, ip_encrypted),
        ip_source = COALESCE(p_ip_source, ip_source),
        country = COALESCE(p_country, country),
        city = COALESCE(p_city, city),
        isp = COALESCE(p_isp, isp),
        vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
        last_seen_at = NOW()
    WHERE id = p_guest_id;
    
    INSERT INTO public.ip_security_logs (
        guest_id, ip_hash, ip_encrypted, ip_source, 
        country, city, isp, vpn_detected, action
    ) VALUES (
        p_guest_id, p_ip_hash, p_ip_encrypted, p_ip_source,
        p_country, p_city, p_isp, p_vpn_detected, 'visit'
    );
END;
$$;

-- Drop old function signatures
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

-- Create log_user_security function
CREATE OR REPLACE FUNCTION log_user_security(
    p_ip_hash TEXT DEFAULT NULL,
    p_ip_encrypted TEXT DEFAULT NULL,
    p_ip_source TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN;
    END IF;
    
    UPDATE public.profiles
    SET 
        ip_hash = COALESCE(p_ip_hash, ip_hash),
        ip_encrypted = COALESCE(p_ip_encrypted, ip_encrypted),
        ip_source = COALESCE(p_ip_source, ip_source),
        country = COALESCE(p_country, country),
        city = COALESCE(p_city, city),
        isp = COALESCE(p_isp, isp),
        vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
        last_ip_update = NOW()
    WHERE id = v_user_id;
    
    INSERT INTO public.ip_security_logs (
        user_id, ip_hash, ip_encrypted, ip_source,
        country, city, isp, vpn_detected, action
    ) VALUES (
        v_user_id, p_ip_hash, p_ip_encrypted, p_ip_source,
        p_country, p_city, p_isp, p_vpn_detected, 'login'
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_guest_security TO anon;
GRANT EXECUTE ON FUNCTION log_guest_security TO authenticated;
GRANT EXECUTE ON FUNCTION log_user_security TO authenticated;

SELECT 'Step 2 complete - functions created' AS status;
