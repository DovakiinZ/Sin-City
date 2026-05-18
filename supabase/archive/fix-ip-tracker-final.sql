-- =====================================================
-- FINAL IP TRACKER UNIFICATION
-- =====================================================

-- 1. DROP ALL EXISTING OVERLOADS OF THESE FUNCTIONS
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Drop log_user_security
    FOR r IN (SELECT oid::regprocedure AS proc_name FROM pg_proc WHERE proname = 'log_user_security' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;
    
    -- Drop log_guest_security
    FOR r IN (SELECT oid::regprocedure AS proc_name FROM pg_proc WHERE proname = 'log_guest_security' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;
    
    -- Drop log_guest_security_with_claim
    FOR r IN (SELECT oid::regprocedure AS proc_name FROM pg_proc WHERE proname = 'log_guest_security_with_claim' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;
END $$;

-- 2. ENSURE TABLES HAVE ALL REQUIRED COLUMNS
DO $$
BEGIN
    -- profiles table
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

    -- guests table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'ip_hash') THEN
        ALTER TABLE public.guests ADD COLUMN ip_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'ip_encrypted') THEN
        ALTER TABLE public.guests ADD COLUMN ip_encrypted TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'ip_source') THEN
        ALTER TABLE public.guests ADD COLUMN ip_source TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'country') THEN
        ALTER TABLE public.guests ADD COLUMN country TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'city') THEN
        ALTER TABLE public.guests ADD COLUMN city TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'isp') THEN
        ALTER TABLE public.guests ADD COLUMN isp TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'vpn_detected') THEN
        ALTER TABLE public.guests ADD COLUMN vpn_detected BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'tor_detected') THEN
        ALTER TABLE public.guests ADD COLUMN tor_detected BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. ENSURE ip_security_logs TABLE IS CORRECT
CREATE TABLE IF NOT EXISTS public.ip_security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE,
    real_ip TEXT NOT NULL,
    ip_hash TEXT,
    ip_encrypted TEXT,
    ip_source TEXT,
    country TEXT,
    city TEXT,
    isp TEXT,
    vpn_detected BOOLEAN DEFAULT FALSE,
    tor_detected BOOLEAN DEFAULT FALSE,
    action TEXT DEFAULT 'log',
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    request_headers JSONB,
    CONSTRAINT unique_guest_or_user CHECK (guest_id IS NOT NULL OR user_id IS NOT NULL)
);

-- ADD MISSING COLUMNS IF TABLE ALREADY EXISTED
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ip_security_logs' AND column_name = 'ip_hash') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN ip_hash TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ip_security_logs' AND column_name = 'ip_encrypted') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN ip_encrypted TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ip_security_logs' AND column_name = 'ip_source') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN ip_source TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ip_security_logs' AND column_name = 'tor_detected') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN tor_detected BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ip_security_logs' AND column_name = 'action') THEN
        ALTER TABLE public.ip_security_logs ADD COLUMN action TEXT DEFAULT 'log';
    END IF;
END $$;

-- Fix indexes
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_ip_hash ON public.ip_security_logs(ip_hash);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_user_id ON public.ip_security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_guest_id ON public.ip_security_logs(guest_id);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_created_at ON public.ip_security_logs(last_seen_at);

-- Add unique constraints for upsert logic if missing
ALTER TABLE public.ip_security_logs DROP CONSTRAINT IF EXISTS ip_security_logs_user_id_key;
ALTER TABLE public.ip_security_logs DROP CONSTRAINT IF EXISTS ip_security_logs_guest_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_user_single ON public.ip_security_logs(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_guest_single ON public.ip_security_logs(guest_id) WHERE guest_id IS NOT NULL;

-- 4. RLS POLICIES
ALTER TABLE public.ip_security_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all public access" ON public.ip_security_logs;
CREATE POLICY "Deny all public access" ON public.ip_security_logs FOR ALL TO public USING (false);

DROP POLICY IF EXISTS "Admins can view security logs" ON public.ip_security_logs;
DROP POLICY IF EXISTS "Admins can view all security logs" ON public.ip_security_logs;
CREATE POLICY "Admins can view all security logs" 
ON public.ip_security_logs FOR SELECT TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

DROP POLICY IF EXISTS "System can insert logs" ON public.ip_security_logs;
CREATE POLICY "System can insert logs" ON public.ip_security_logs FOR INSERT WITH CHECK (true);

-- 5. RE-IMPLEMENT RPC FUNCTIONS WITH CORRECT SIGNATURES

-- Helper: Get Real IP from server context
CREATE OR REPLACE FUNCTION get_request_ip()
RETURNS TEXT AS $$
DECLARE
    headers JSONB;
    xff TEXT;
    real_ip TEXT;
BEGIN
    BEGIN
        headers := current_setting('request.headers', true)::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN 'unknown';
    END;
    
    xff := headers ->> 'x-forwarded-for';
    IF xff IS NOT NULL THEN
        real_ip := trim(split_part(xff, ',', 1));
    ELSE
        real_ip := COALESCE(
            headers ->> 'cf-connecting-ip',
            headers ->> 'x-real-ip',
            headers ->> 'true-client-ip',
            'unknown'
        );
    END IF;
    RETURN real_ip;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure pgcrypto is available for fingerprinting
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper: Generate Fingerprint
CREATE OR REPLACE FUNCTION generate_ip_fingerprint(p_ip TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(p_ip || 'sin-city-secure-salt-v1', 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- 5. RE-IMPLEMENT RPC FUNCTIONS WITH CORRECT SIGNATURES (Cleanup)
-- Done at start of script. Now defining final implementations:

-- ============================================================================
-- 2. IP & SECURITY LOGGING FUNCTIONS
-- ============================================================================

-- CLEANUP OLD FUNCTIONS (Drop all possible overloads)
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop log_user_security
    FOR r IN (SELECT oid::regprocedure AS proc_name FROM pg_proc WHERE proname = 'log_user_security' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;

    -- Drop log_guest_security
    FOR r IN (SELECT oid::regprocedure AS proc_name FROM pg_proc WHERE proname = 'log_guest_security' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;

    -- Drop log_guest_security_with_claim
    FOR r IN (SELECT oid::regprocedure AS proc_name FROM pg_proc WHERE proname = 'log_guest_security_with_claim' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;

    -- Drop auto_merge_on_registration
    FOR r IN (SELECT oid::regprocedure AS proc_name FROM pg_proc WHERE proname = 'auto_merge_on_registration' AND pronamespace = 'public'::regnamespace) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;
END $$;

-- 2a. LOG USER SECURITY DATA
CREATE OR REPLACE FUNCTION public.log_user_security(
    p_ip_hash TEXT DEFAULT NULL,
    p_ip_encrypted TEXT DEFAULT NULL,
    p_ip_source TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_real_ip TEXT;
BEGIN
    -- Capture actual IP from headers if not provided
    v_real_ip := COALESCE(
        current_setting('request.headers', true)::json->>'cf-connecting-ip',
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        current_setting('request.headers', true)::json->>'x-real-ip',
        'unknown'
    );

    -- Upsert to ip_security_logs (update if user already has a row)
    INSERT INTO public.ip_security_logs (
        user_id,
        ip_hash,
        ip_encrypted,
        ip_source,
        real_ip,
        country,
        city,
        isp,
        vpn_detected,
        tor_detected,
        action,
        first_seen_at,
        last_seen_at
    ) VALUES (
        v_user_id,
        p_ip_hash,
        p_ip_encrypted,
        p_ip_source,
        v_real_ip,
        p_country,
        p_city,
        p_isp,
        p_vpn_detected,
        p_tor_detected,
        'user_login_capture',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL
    DO UPDATE SET
        ip_hash = EXCLUDED.ip_hash,
        ip_encrypted = EXCLUDED.ip_encrypted,
        ip_source = EXCLUDED.ip_source,
        real_ip = EXCLUDED.real_ip,
        country = EXCLUDED.country,
        city = EXCLUDED.city,
        isp = EXCLUDED.isp,
        vpn_detected = EXCLUDED.vpn_detected,
        tor_detected = EXCLUDED.tor_detected,
        action = EXCLUDED.action,
        last_seen_at = NOW();

    -- Update profile with latest IP info
    IF v_user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET 
            ip_hash = p_ip_hash,
            ip_encrypted = p_ip_encrypted,
            ip_source = p_ip_source,
            country = p_country,
            city = p_city,
            isp = p_isp,
            vpn_detected = p_vpn_detected,
            tor_detected = p_tor_detected,
            last_ip_update = NOW()
        WHERE id = v_user_id;
    END IF;

    RETURN json_build_object('success', true, 'ip_logged', v_real_ip);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2b. LOG GUEST SECURITY DATA (Basic)
CREATE OR REPLACE FUNCTION public.log_guest_security(
    p_guest_id UUID,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
    v_real_ip TEXT;
BEGIN
    v_real_ip := COALESCE(
        current_setting('request.headers', true)::json->>'cf-connecting-ip',
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        'unknown'
    );

    INSERT INTO public.ip_security_logs (
        guest_id,
        real_ip,
        isp,
        vpn_detected,
        tor_detected,
        action,
        first_seen_at,
        last_seen_at
    ) VALUES (
        p_guest_id,
        v_real_ip,
        p_isp,
        p_vpn_detected,
        p_tor_detected,
        'guest_activity_capture',
        NOW(),
        NOW()
    )
    ON CONFLICT (guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        real_ip = EXCLUDED.real_ip,
        isp = EXCLUDED.isp,
        vpn_detected = EXCLUDED.vpn_detected,
        tor_detected = EXCLUDED.tor_detected,
        action = EXCLUDED.action,
        last_seen_at = NOW();

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2c. LOG GUEST SECURITY DATA + CLAIM OLD POSTS
CREATE OR REPLACE FUNCTION public.log_guest_security_with_claim(
    p_guest_id UUID,
    p_ip_hash TEXT DEFAULT NULL,
    p_ip_encrypted TEXT DEFAULT NULL,
    p_ip_source TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
    v_real_ip TEXT;
    v_claimed_posts INTEGER := 0;
BEGIN
    -- 1. Get Real IP
    v_real_ip := COALESCE(
        current_setting('request.headers', true)::json->>'cf-connecting-ip',
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        'unknown'
    );

    -- 2. Upsert security entry (update if guest already has a row)
    INSERT INTO public.ip_security_logs (
        guest_id,
        ip_hash,
        ip_encrypted,
        ip_source,
        real_ip,
        vpn_detected,
        tor_detected,
        action,
        first_seen_at,
        last_seen_at
    ) VALUES (
        p_guest_id,
        p_ip_hash,
        p_ip_encrypted,
        p_ip_source,
        v_real_ip,
        p_vpn_detected,
        p_tor_detected,
        'guest_claim_capture',
        NOW(),
        NOW()
    )
    ON CONFLICT (guest_id) WHERE guest_id IS NOT NULL
    DO UPDATE SET
        ip_hash = EXCLUDED.ip_hash,
        ip_encrypted = EXCLUDED.ip_encrypted,
        ip_source = EXCLUDED.ip_source,
        real_ip = EXCLUDED.real_ip,
        vpn_detected = EXCLUDED.vpn_detected,
        tor_detected = EXCLUDED.tor_detected,
        action = EXCLUDED.action,
        last_seen_at = NOW();

    -- 3. Claim any orphaned posts with matching ip_hash
    IF p_ip_hash IS NOT NULL THEN
        UPDATE public.posts
        SET guest_id = p_guest_id
        WHERE ip_hash = p_ip_hash
        AND guest_id IS NULL
        AND user_id IS NULL;
        
        GET DIAGNOSTICS v_claimed_posts = ROW_COUNT;
    END IF;

    RETURN json_build_object(
        'success', true, 
        'real_ip', v_real_ip,
        'claimed_posts', v_claimed_posts
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2d. AUTO-MERGE GUEST DATA ON REGISTRATION
CREATE OR REPLACE FUNCTION public.auto_merge_on_registration(
    p_user_id UUID,
    p_guest_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_posts_count INTEGER := 0;
    v_comments_count INTEGER := 0;
BEGIN
    -- Update posts: transfer ownership from guest to registered user
    UPDATE public.posts 
    SET user_id = p_user_id, author_type = 'user' 
    WHERE guest_id = p_guest_id;
    GET DIAGNOSTICS v_posts_count = ROW_COUNT;

    -- Update comments: transfer ownership
    UPDATE public.comments 
    SET user_id = p_user_id 
    WHERE guest_id = p_guest_id;
    GET DIAGNOSTICS v_comments_count = ROW_COUNT;

    -- Update messaging session_messages if they exist
    UPDATE public.session_messages
    SET user_id = p_user_id
    WHERE guest_id = p_guest_id;

    RETURN json_build_object(
        'success', true,
        'merged_posts', v_posts_count,
        'merged_comments', v_comments_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.log_user_security TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_guest_security TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_guest_security_with_claim TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_merge_on_registration TO authenticated;

SELECT 'Unified IP Tracker implementation complete' as status;
