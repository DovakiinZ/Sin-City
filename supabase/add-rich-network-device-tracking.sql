-- =====================================================
-- Rich Network + Device Tracking
-- Adds detailed geo/network profile (region, postal, coords, timezone, ASN,
-- ISP domain, continent) plus real proxy/hosting/mobile flags from the
-- dual-provider lookup (ipwho.is + ip-api.com), for both guests and users.
-- Fully additive & idempotent — safe to run on a live DB.
-- Run in Supabase SQL Editor.
-- =====================================================

-- ============================================================================
-- 1. GUESTS
-- ============================================================================
ALTER TABLE public.guests
    ADD COLUMN IF NOT EXISTS network_info JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS proxy_detected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hosting_detected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mobile_detected BOOLEAN DEFAULT FALSE,
    -- Legacy 32-bit fingerprint kept so existing anonymous identities still
    -- match after the fingerprint algorithm was strengthened.
    ADD COLUMN IF NOT EXISTS fingerprint_legacy TEXT;

CREATE INDEX IF NOT EXISTS idx_guests_proxy ON public.guests(proxy_detected) WHERE proxy_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_guests_hosting ON public.guests(hosting_detected) WHERE hosting_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_guests_fingerprint_legacy ON public.guests(fingerprint_legacy) WHERE fingerprint_legacy IS NOT NULL;

-- ============================================================================
-- 2. PROFILES (registered users)
-- ============================================================================
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS network_info JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS proxy_detected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hosting_detected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mobile_detected BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_proxy ON public.profiles(proxy_detected) WHERE proxy_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_hosting ON public.profiles(hosting_detected) WHERE hosting_detected = TRUE;

-- ============================================================================
-- 3. Documentation
-- ============================================================================
COMMENT ON COLUMN public.guests.network_info IS 'Full geo/network profile from ipwho.is + ip-api.com: region, postal, lat/lon, timezone, asn, isp_domain, continent, is_eu, providers used.';
COMMENT ON COLUMN public.guests.proxy_detected IS 'Real proxy/VPN flag from ip-api.com (not keyword-guessed).';
COMMENT ON COLUMN public.guests.hosting_detected IS 'IP belongs to a datacenter/hosting provider (ip-api.com).';
COMMENT ON COLUMN public.guests.mobile_detected IS 'IP is a mobile/cellular network (ip-api.com).';
COMMENT ON COLUMN public.guests.fingerprint_legacy IS 'Previous 32-bit fingerprint, kept for backward-compatible identity matching.';
COMMENT ON COLUMN public.profiles.network_info IS 'Full geo/network + parsed device profile for the registered user.';

DO $$
BEGIN
    RAISE NOTICE '✅ Rich network + device columns added to guests and profiles.';
END $$;
