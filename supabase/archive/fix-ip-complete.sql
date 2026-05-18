-- =====================================================
-- COMPLETE IP FIX - Run this all at once
-- =====================================================

-- STEP 1: Drop functions that reference non-existent columns
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS log_guest_security(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS log_user_security(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

-- STEP 2: Add columns to guests table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'ip_hash') THEN
        ALTER TABLE public.guests ADD COLUMN ip_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'ip_encrypted') THEN
        ALTER TABLE public.guests ADD COLUMN ip_encrypted TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'ip_source') THEN
        ALTER TABLE public.guests ADD COLUMN ip_source TEXT;
    END IF;
END $$;

-- STEP 3: Add columns to profiles table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ip_hash') THEN
        ALTER TABLE public.profiles ADD COLUMN ip_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ip_encrypted') THEN
        ALTER TABLE public.profiles ADD COLUMN ip_encrypted TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ip_source') THEN
        ALTER TABLE public.profiles ADD COLUMN ip_source TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'country') THEN
        ALTER TABLE public.profiles ADD COLUMN country TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'city') THEN
        ALTER TABLE public.profiles ADD COLUMN city TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'isp') THEN
        ALTER TABLE public.profiles ADD COLUMN isp TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'vpn_detected') THEN
        ALTER TABLE public.profiles ADD COLUMN vpn_detected BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tor_detected') THEN
        ALTER TABLE public.profiles ADD COLUMN tor_detected BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_ip_update') THEN
        ALTER TABLE public.profiles ADD COLUMN last_ip_update TIMESTAMPTZ;
    END IF;
END $$;

-- STEP 4: Create ip_security_logs table
CREATE TABLE IF NOT EXISTS public.ip_security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    guest_id UUID,
    ip_hash TEXT,
    ip_encrypted TEXT,
    ip_source TEXT,
    country TEXT,
    city TEXT,
    isp TEXT,
    vpn_detected BOOLEAN DEFAULT FALSE,
    tor_detected BOOLEAN DEFAULT FALSE,
    action TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_ip_hash ON public.ip_security_logs(ip_hash);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_created_at ON public.ip_security_logs(created_at);

-- Enable RLS
ALTER TABLE public.ip_security_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view IP logs" ON public.ip_security_logs;
CREATE POLICY "Admins can view IP logs" ON public.ip_security_logs
FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Allow insert IP logs" ON public.ip_security_logs;
CREATE POLICY "Allow insert IP logs" ON public.ip_security_logs FOR INSERT WITH CHECK (true);

-- STEP 5: Recreate functions now that columns exist
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
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.guests SET 
        ip_hash = COALESCE(p_ip_hash, ip_hash),
        ip_encrypted = COALESCE(p_ip_encrypted, ip_encrypted),
        ip_source = COALESCE(p_ip_source, ip_source),
        country = COALESCE(p_country, country),
        city = COALESCE(p_city, city),
        isp = COALESCE(p_isp, isp),
        vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
        last_seen_at = NOW()
    WHERE id = p_guest_id;
    
    INSERT INTO public.ip_security_logs (guest_id, ip_hash, ip_encrypted, ip_source, country, city, isp, vpn_detected, action)
    VALUES (p_guest_id, p_ip_hash, p_ip_encrypted, p_ip_source, p_country, p_city, p_isp, p_vpn_detected, 'visit');
END;
$$;

CREATE OR REPLACE FUNCTION log_user_security(
    p_ip_hash TEXT DEFAULT NULL,
    p_ip_encrypted TEXT DEFAULT NULL,
    p_ip_source TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RETURN; END IF;
    
    UPDATE public.profiles SET 
        ip_hash = COALESCE(p_ip_hash, ip_hash),
        ip_encrypted = COALESCE(p_ip_encrypted, ip_encrypted),
        ip_source = COALESCE(p_ip_source, ip_source),
        country = COALESCE(p_country, country),
        city = COALESCE(p_city, city),
        isp = COALESCE(p_isp, isp),
        vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
        last_ip_update = NOW()
    WHERE id = v_user_id;
    
    INSERT INTO public.ip_security_logs (user_id, ip_hash, ip_encrypted, ip_source, country, city, isp, vpn_detected, action)
    VALUES (v_user_id, p_ip_hash, p_ip_encrypted, p_ip_source, p_country, p_city, p_isp, p_vpn_detected, 'login');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_guest_security TO anon;
GRANT EXECUTE ON FUNCTION log_guest_security TO authenticated;
GRANT EXECUTE ON FUNCTION log_user_security TO authenticated;

SELECT 'IP storage complete!' AS status;
