-- =====================================================
-- IP Storage Enhancement Schema (FIXED)
-- =====================================================
-- Adds encrypted IP storage and source tracking for security

-- 1. Add ALL IP-related columns to guests table (including ip_hash if missing)
ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS ip_hash TEXT,
ADD COLUMN IF NOT EXISTS ip_encrypted TEXT,
ADD COLUMN IF NOT EXISTS ip_source TEXT;

COMMENT ON COLUMN public.guests.ip_hash IS 'SHA-256 hash of IP for matching/rate-limiting';
COMMENT ON COLUMN public.guests.ip_encrypted IS 'AES-256 encrypted raw IP for super-admin decryption';
COMMENT ON COLUMN public.guests.ip_source IS 'Header source used: cf, cf-true, xff, real, socket';

-- 2. Add ALL IP-related columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ip_hash TEXT,
ADD COLUMN IF NOT EXISTS ip_encrypted TEXT,
ADD COLUMN IF NOT EXISTS ip_source TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS isp TEXT,
ADD COLUMN IF NOT EXISTS vpn_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tor_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_ip_update TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.ip_hash IS 'SHA-256 hash of IP for matching/rate-limiting';
COMMENT ON COLUMN public.profiles.ip_encrypted IS 'AES-256 encrypted raw IP for super-admin decryption';
COMMENT ON COLUMN public.profiles.ip_source IS 'Header source used: cf, cf-true, xff, real, socket';

-- 3. Create/update ip_security_logs table for detailed audit
CREATE TABLE IF NOT EXISTS public.ip_security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
    ip_hash TEXT,
    ip_encrypted TEXT,
    ip_source TEXT,
    country TEXT,
    city TEXT,
    isp TEXT,
    vpn_detected BOOLEAN DEFAULT FALSE,
    tor_detected BOOLEAN DEFAULT FALSE,
    action TEXT,  -- 'login', 'post', 'comment', 'message', etc.
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_ip_hash ON public.ip_security_logs(ip_hash);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_user_id ON public.ip_security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_guest_id ON public.ip_security_logs(guest_id);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_created_at ON public.ip_security_logs(created_at);

-- 4. Enable RLS on ip_security_logs (super admin only)
ALTER TABLE public.ip_security_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Super admins can view IP security logs" ON public.ip_security_logs;
DROP POLICY IF EXISTS "System can insert IP logs" ON public.ip_security_logs;

-- Only super admins can view IP security logs
CREATE POLICY "Super admins can view IP security logs"
ON public.ip_security_logs
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
);

-- Allow inserts from anyone (the function handles security)
CREATE POLICY "System can insert IP logs"
ON public.ip_security_logs
FOR INSERT
WITH CHECK (true);

-- 5. Drop and recreate the log_guest_security function
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

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
    -- Update guest record with IP data
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
    
    -- Insert security log entry
    INSERT INTO public.ip_security_logs (
        guest_id, ip_hash, ip_encrypted, ip_source, 
        country, city, isp, vpn_detected, action
    ) VALUES (
        p_guest_id, p_ip_hash, p_ip_encrypted, p_ip_source,
        p_country, p_city, p_isp, p_vpn_detected, 'visit'
    );
END;
$$;

-- 6. Drop and recreate the log_user_security function
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

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
    
    -- Update profile record with IP data
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
    
    -- Insert security log entry
    INSERT INTO public.ip_security_logs (
        user_id, ip_hash, ip_encrypted, ip_source,
        country, city, isp, vpn_detected, action
    ) VALUES (
        v_user_id, p_ip_hash, p_ip_encrypted, p_ip_source,
        p_country, p_city, p_isp, p_vpn_detected, 'login'
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION log_guest_security TO anon;
GRANT EXECUTE ON FUNCTION log_guest_security TO authenticated;
GRANT EXECUTE ON FUNCTION log_user_security TO authenticated;

-- Verify
SELECT 'IP storage schema updated successfully' AS status;
