-- =====================================================
-- IP Security Update: Plain Text Storage with Admin Audit
-- Run this to update the IP storage structure
-- =====================================================

-- STEP 1: Add real_ip column to ip_security_logs (plain text for admin visibility)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'ip_security_logs' 
        AND column_name = 'real_ip') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN real_ip TEXT;
    END IF;
    
    -- Add ip_fingerprint for storing device fingerprint with IP records
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'ip_security_logs' 
        AND column_name = 'ip_fingerprint') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN ip_fingerprint TEXT;
    END IF;
    
    -- Add last_seen_at for tracking activity timestamps
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'ip_security_logs' 
        AND column_name = 'last_seen_at') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN last_seen_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- STEP 2: Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_real_ip ON public.ip_security_logs(real_ip);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_ip_fingerprint ON public.ip_security_logs(ip_fingerprint);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_last_seen_at ON public.ip_security_logs(last_seen_at);

-- STEP 3: Add user_id and guest_id indexes if missing
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_user_id ON public.ip_security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_guest_id ON public.ip_security_logs(guest_id);

-- STEP 4: Create IP access audit log table
CREATE TABLE IF NOT EXISTS public.ip_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES auth.users(id),
    accessed_ip TEXT NOT NULL,
    accessed_record_type TEXT NOT NULL, -- 'user', 'guest', 'security_log'
    accessed_record_id UUID,
    access_reason TEXT,
    accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_access_audit_admin_id ON public.ip_access_audit(admin_id);
CREATE INDEX IF NOT EXISTS idx_ip_access_audit_accessed_at ON public.ip_access_audit(accessed_at);

-- Enable RLS on audit table
ALTER TABLE public.ip_access_audit ENABLE ROW LEVEL SECURITY;

-- Only super admins can view IP access audit
DROP POLICY IF EXISTS "Super admins view IP access audit" ON public.ip_access_audit;
CREATE POLICY "Super admins view IP access audit" ON public.ip_access_audit
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- System can insert audit logs
DROP POLICY IF EXISTS "System insert IP access audit" ON public.ip_access_audit;
CREATE POLICY "System insert IP access audit" ON public.ip_access_audit
FOR INSERT WITH CHECK (true);

-- STEP 5: Update log_guest_security function to store real_ip and fingerprint
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION log_guest_security(
    p_guest_id UUID,
    p_ip_hash TEXT DEFAULT NULL,
    p_real_ip TEXT DEFAULT NULL,         -- Plain text IP for admin
    p_ip_source TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_action TEXT DEFAULT 'visit',
    p_fingerprint TEXT DEFAULT NULL      -- Device fingerprint
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Update guest record
    UPDATE public.guests SET 
        ip_hash = COALESCE(p_ip_hash, ip_hash),
        ip_source = COALESCE(p_ip_source, ip_source),
        country = COALESCE(p_country, country),
        city = COALESCE(p_city, city),
        isp = COALESCE(p_isp, isp),
        vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
        last_seen_at = NOW()
    WHERE id = p_guest_id;
    
    -- Insert security log with real IP and fingerprint
    INSERT INTO public.ip_security_logs (
        guest_id, ip_hash, real_ip, ip_fingerprint, ip_source, 
        country, city, isp, vpn_detected, action, last_seen_at
    )
    VALUES (
        p_guest_id, p_ip_hash, p_real_ip, p_fingerprint, p_ip_source,
        p_country, p_city, p_isp, p_vpn_detected, p_action, NOW()
    );
END;
$$;

-- STEP 6: Update log_user_security function to store real_ip
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION log_user_security(
    p_ip_hash TEXT DEFAULT NULL,
    p_real_ip TEXT DEFAULT NULL,         -- Plain text IP for admin
    p_ip_source TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_action TEXT DEFAULT 'login'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN; END IF;
    
    -- Update profile
    UPDATE public.profiles SET 
        ip_hash = COALESCE(p_ip_hash, ip_hash),
        ip_source = COALESCE(p_ip_source, ip_source),
        country = COALESCE(p_country, country),
        city = COALESCE(p_city, city),
        isp = COALESCE(p_isp, isp),
        vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
        last_ip_update = NOW()
    WHERE id = v_user_id;
    
    -- Insert security log with real IP
    INSERT INTO public.ip_security_logs (
        user_id, ip_hash, real_ip, ip_source,
        country, city, isp, vpn_detected, action, last_seen_at
    )
    VALUES (
        v_user_id, p_ip_hash, p_real_ip, p_ip_source,
        p_country, p_city, p_isp, p_vpn_detected, p_action, NOW()
    );
END;
$$;

-- STEP 7: Create function to log admin IP access (audit trail)
CREATE OR REPLACE FUNCTION log_admin_ip_access(
    p_accessed_ip TEXT,
    p_record_type TEXT,
    p_record_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL THEN RETURN; END IF;
    
    -- Verify caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
        RAISE EXCEPTION 'Only admins can access IP data';
    END IF;
    
    INSERT INTO public.ip_access_audit (
        admin_id, accessed_ip, accessed_record_type, accessed_record_id, access_reason
    )
    VALUES (v_admin_id, p_accessed_ip, p_record_type, p_record_id, p_reason);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_guest_security TO anon;
GRANT EXECUTE ON FUNCTION log_guest_security TO authenticated;
GRANT EXECUTE ON FUNCTION log_user_security TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_ip_access TO authenticated;

SELECT 'IP security with admin audit complete!' AS status;
