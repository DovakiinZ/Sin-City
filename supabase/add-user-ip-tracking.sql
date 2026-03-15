-- Add IP tracking columns to profiles table for registered users
-- Run this in Supabase SQL Editor

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ip_hash TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS isp TEXT,
ADD COLUMN IF NOT EXISTS vpn_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tor_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_ip_update TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups by country
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);

-- Comment for documentation
COMMENT ON COLUMN public.profiles.ip_hash IS 'Hashed IP address for privacy';
COMMENT ON COLUMN public.profiles.country IS 'Country detected from IP';
COMMENT ON COLUMN public.profiles.city IS 'City detected from IP';
COMMENT ON COLUMN public.profiles.isp IS 'Internet Service Provider';
COMMENT ON COLUMN public.profiles.vpn_detected IS 'Whether VPN usage was detected';
COMMENT ON COLUMN public.profiles.tor_detected IS 'Whether Tor usage was detected';
COMMENT ON COLUMN public.profiles.last_ip_update IS 'Last time IP data was updated';
