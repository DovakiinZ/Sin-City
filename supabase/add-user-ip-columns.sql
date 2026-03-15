-- Add IP/Network columns to profiles table for registered users
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. ADD IP/NETWORK COLUMNS TO PROFILES TABLE
-- ============================================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ip_hash TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS isp TEXT,
ADD COLUMN IF NOT EXISTS vpn_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tor_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_ip_update TIMESTAMPTZ;

-- Create indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_ip_hash ON public.profiles(ip_hash) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_vpn ON public.profiles(vpn_detected) WHERE vpn_detected = TRUE;

-- ============================================================================
-- 2. FUNCTION TO UPDATE USER IP (called from API)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_ip(
    p_user_id UUID,
    p_ip_hash TEXT,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.profiles
    SET 
        ip_hash = p_ip_hash,
        country = COALESCE(p_country, country),
        city = COALESCE(p_city, city),
        isp = COALESCE(p_isp, isp),
        vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
        tor_detected = COALESCE(p_tor_detected, tor_detected),
        last_ip_update = NOW()
    WHERE id = p_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_user_ip TO authenticated;

-- ============================================================================
-- 3. SQL QUERY TO VIEW ALL USERS WITH IP DATA (Admin only)
-- ============================================================================

-- Run this query to see all registered users with their IP data:
/*
SELECT 
    p.id,
    p.username,
    p.ip_hash,
    p.country,
    p.city,
    p.isp,
    p.vpn_detected,
    p.tor_detected,
    p.last_ip_update,
    u.email,
    p.created_at
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
ORDER BY p.last_ip_update DESC NULLS LAST;
*/

DO $$
BEGIN
  RAISE NOTICE '✅ IP columns added to profiles table!';
  RAISE NOTICE 'Users will need to log in again for IP data to be captured.';
END $$;
