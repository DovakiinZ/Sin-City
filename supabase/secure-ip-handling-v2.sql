-- Secure IP Handling System (Extended for Users)
-- Implements dedicated security table and server-side IP capture for Guests AND Users

-- ============================================================================
-- 1. MIGRATE / UPDATE SECURITY TABLE
-- ============================================================================

-- Rename table if it exists (or create new if not)
-- Using ALTER TABLE to rename if exists, but for idempotency we'll just alter
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guest_security') THEN
        ALTER TABLE public.guest_security RENAME TO ip_security_logs;
    Else
        CREATE TABLE IF NOT EXISTS public.ip_security_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Add user_id
            real_ip TEXT NOT NULL,
            ip_fingerprint TEXT,
            country TEXT,
            city TEXT,
            isp TEXT,
            vpn_detected BOOLEAN DEFAULT FALSE,
            first_seen_at TIMESTAMPTZ DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ DEFAULT NOW(),
            request_headers JSONB,
            CONSTRAINT unique_guest_or_user CHECK (guest_id IS NOT NULL OR user_id IS NOT NULL)
        );
    END IF;
END $$;

-- Add user_id column if it doesn't exist (if table was just renamed)
ALTER TABLE public.ip_security_logs 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update constraints (remove unique guest_id if it prevents multiple users)
-- Actually we probably want one record per entity (Guest OR User)
-- For Guest: Unique(guest_id)
-- For User: Unique(user_id)
ALTER TABLE public.ip_security_logs DROP CONSTRAINT IF EXISTS guest_security_guest_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_guest ON public.ip_security_logs(guest_id) WHERE guest_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_security_user ON public.ip_security_logs(user_id) WHERE user_id IS NOT NULL;


-- ============================================================================
-- 2. SECURE ACCESS CONTROL (RLS)
-- ============================================================================

ALTER TABLE public.ip_security_logs ENABLE ROW LEVEL SECURITY;

-- Block ALL access to public/anon
DROP POLICY IF EXISTS "Deny all public access" ON public.ip_security_logs;
CREATE POLICY "Deny all public access" 
ON public.ip_security_logs 
FOR ALL 
TO public 
USING (false);

-- Allow Admins to VIEW
DROP POLICY IF EXISTS "Admins can view security logs" ON public.ip_security_logs;
CREATE POLICY "Admins can view all security logs" 
ON public.ip_security_logs 
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
-- 3. USER LOGGING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION log_user_security(
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE
)
RETURNS VOID AS $$
DECLARE
    v_ip TEXT;
    v_fingerprint TEXT;
    v_user_id UUID;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Capture IP from server headers
    v_ip := get_request_ip();
    
    -- 2. Generate Fingerprint
    v_fingerprint := generate_ip_fingerprint(v_ip);
    
    -- 3. Upsert Security Record
    INSERT INTO public.ip_security_logs (
        user_id,
        real_ip,
        ip_fingerprint,
        country,
        city,
        isp,
        vpn_detected,
        last_seen_at
    )
    VALUES (
        v_user_id,
        v_ip,
        v_fingerprint,
        p_country,
        p_city,
        p_isp,
        p_vpn_detected,
        NOW()
    )
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL 
    DO UPDATE
    SET
        real_ip = v_ip,
        ip_fingerprint = v_fingerprint,
        country = COALESCE(EXCLUDED.country, public.ip_security_logs.country),
        city = COALESCE(EXCLUDED.city, public.ip_security_logs.city),
        isp = COALESCE(EXCLUDED.isp, public.ip_security_logs.isp),
        vpn_detected = EXCLUDED.vpn_detected,
        last_seen_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. UPDATE GUEST LOGGING FUNCTION (To use new table)
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
    v_ip := get_request_ip();
    v_fingerprint := generate_ip_fingerprint(v_ip);
    
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
        country = COALESCE(EXCLUDED.country, public.ip_security_logs.country),
        city = COALESCE(EXCLUDED.city, public.ip_security_logs.city),
        isp = COALESCE(EXCLUDED.isp, public.ip_security_logs.isp),
        vpn_detected = EXCLUDED.vpn_detected,
        last_seen_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to authenticated users to call the log function
GRANT EXECUTE ON FUNCTION log_user_security TO authenticated;
