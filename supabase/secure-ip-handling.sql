-- Secure IP Handling System
-- Implements dedicated security table and server-side IP capture

-- ============================================================================
-- 1. CREATE SECURITY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guest_security (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE,
    real_ip TEXT NOT NULL, -- Stored in plain text but protected by RLS
    ip_fingerprint TEXT,   -- Hash for correlation
    country TEXT,
    city TEXT,
    isp TEXT,
    vpn_detected BOOLEAN DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    request_headers JSONB, -- Store headers for audit (optional)
    UNIQUE(guest_id)
);

-- ============================================================================
-- 2. SECURE ACCESS CONTROL (RLS)
-- ============================================================================

ALTER TABLE public.guest_security ENABLE ROW LEVEL SECURITY;

-- Block ALL access to public/anon/authenticated by default
CREATE POLICY "Deny all public access" 
ON public.guest_security 
FOR ALL 
TO public 
USING (false);

-- Enable access for service role (implicit, but good to be explicit about intent)
-- Service role bypasses RLS, so no policy strictly needed, but we rely on that.

-- Allow Admins to VIEW
-- This assumes you have an 'admin' role system. 
-- Adjust the Check logic to match your actual admin check common in other tables.
CREATE POLICY "Admins can view security logs" 
ON public.guest_security 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);

-- ============================================================================
-- 3. IP CAPTURE HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION get_request_ip()
RETURNS TEXT AS $$
DECLARE
    headers JSONB;
    xff TEXT;
    real_ip TEXT;
BEGIN
    -- Get headers from current request
    -- current_setting raises error if not found, usually we want to handle that safely
    BEGIN
        headers := current_setting('request.headers', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN 'unknown'; -- Not called in a web context
    END;
    
    -- Try X-Forwarded-For (Standard) - First IP is the client
    xff := headers ->> 'x-forwarded-for';
    
    IF xff IS NOT NULL THEN
        -- Split by comma and take the first one
        real_ip := trim(split_part(xff, ',', 1));
    ELSE
        -- Fallback to specific headers
        real_ip := COALESCE(
            headers ->> 'cf-connecting-ip',
            headers ->> 'x-real-ip',
            'unknown'
        );
    END IF;
    
    RETURN real_ip;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION generate_ip_fingerprint(p_ip TEXT)
RETURNS TEXT AS $$
DECLARE
    v_salt TEXT := 'sin-city-secure-salt-v1'; -- Hardcoded salt for SQL side
BEGIN
    RETURN encode(digest(p_ip || v_salt, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;


-- ============================================================================
-- 4. LOGGING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION log_guest_security(
    p_guest_id UUID,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
DECLARE
    v_ip TEXT;
    v_fingerprint TEXT;
BEGIN
    -- 1. Capture IP from server headers
    v_ip := get_request_ip();
    
    -- 2. Generate Fingerprint
    v_fingerprint := generate_ip_fingerprint(v_ip);
    
    -- 3. Upsert Security Record
    INSERT INTO public.guest_security (
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
    ON CONFLICT (guest_id) DO UPDATE
    SET
        real_ip = v_ip, -- Update IP to latest
        ip_fingerprint = v_fingerprint,
        country = COALESCE(EXCLUDED.country, public.guest_security.country),
        city = COALESCE(EXCLUDED.city, public.guest_security.city),
        isp = COALESCE(EXCLUDED.isp, public.guest_security.isp),
        vpn_detected = EXCLUDED.vpn_detected,
        last_seen_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. UPDATE UPSERT_GUEST TO USE SECURITY LOGGING
-- ============================================================================

-- REPLACING the previous `upsert_guest` to include `log_guest_security` call
CREATE OR REPLACE FUNCTION upsert_guest(
    p_fingerprint TEXT,
    p_fingerprint_hash TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb,
    p_device_memory INTEGER DEFAULT NULL,
    p_hardware_concurrency INTEGER DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE,
    p_focus_time INTEGER DEFAULT NULL,
    p_copy_paste_count INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_guest_id UUID;
    v_is_disposable BOOLEAN := FALSE;
BEGIN
    -- Check if email is disposable
    IF p_email IS NOT NULL THEN
        v_is_disposable := is_disposable_email(p_email);
    END IF;
    
    -- Try to find existing guest by fingerprint
    SELECT id INTO v_guest_id
    FROM public.guests
    WHERE fingerprint = p_fingerprint;
    
    IF v_guest_id IS NULL THEN
        -- Create new guest
        INSERT INTO public.guests (
            fingerprint, 
            fingerprint_hash,
            session_id, 
            email, 
            device_info, 
            device_memory,
            hardware_concurrency,
            ip_hash, -- We still store the client-hashed IP for legacy/quick lookup if needed
            country,
            city,
            isp,
            vpn_detected,
            tor_detected,
            disposable_email_detected,
            last_focus_time,
            copy_paste_count,
            flags
        )
        VALUES (
            p_fingerprint, 
            p_fingerprint_hash,
            p_session_id, 
            p_email, 
            p_device_info, 
            p_device_memory,
            p_hardware_concurrency,
            p_ip_hash, 
            p_country,
            p_city,
            p_isp,
            p_vpn_detected,
            p_tor_detected,
            v_is_disposable,
            p_focus_time,
            COALESCE(p_copy_paste_count, 0),
            ARRAY['new']
        )
        RETURNING id INTO v_guest_id;
    ELSE
        -- Update existing guest
        UPDATE public.guests
        SET 
            fingerprint_hash = COALESCE(p_fingerprint_hash, fingerprint_hash),
            session_id = COALESCE(p_session_id, session_id),
            email = COALESCE(p_email, email),
            device_info = COALESCE(p_device_info, device_info),
            device_memory = COALESCE(p_device_memory, device_memory),
            hardware_concurrency = COALESCE(p_hardware_concurrency, hardware_concurrency),
            ip_hash = COALESCE(p_ip_hash, ip_hash),
            country = COALESCE(p_country, country),
            city = COALESCE(p_city, city),
            isp = COALESCE(p_isp, isp),
            vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
            tor_detected = COALESCE(p_tor_detected, tor_detected),
            disposable_email_detected = CASE 
                WHEN p_email IS NOT NULL THEN v_is_disposable 
                ELSE disposable_email_detected 
            END,
            last_focus_time = COALESCE(p_focus_time, last_focus_time),
            copy_paste_count = copy_paste_count + COALESCE(p_copy_paste_count, 0),
            last_seen_at = NOW()
        WHERE id = v_guest_id;
        
        -- Recalculate trust score
        PERFORM update_guest_trust_and_flags(v_guest_id);
    END IF;
    
    -- === SECURITY LOGGING ===
    -- Capture Real IP and store in security table
    -- We pass the metadata from client (or could be NULL), but IP is captured internally
    PERFORM log_guest_security(
        v_guest_id,
        p_country,
        p_city,
        p_isp,
        p_vpn_detected
    );
    
    RETURN v_guest_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
