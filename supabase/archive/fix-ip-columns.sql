-- =====================================================
-- STEP 1: Add IP columns to tables
-- Run this FIRST, then run fix-ip-storage-functions.sql
-- =====================================================

-- 1. Add ALL IP-related columns to guests table
ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS ip_hash TEXT,
ADD COLUMN IF NOT EXISTS ip_encrypted TEXT,
ADD COLUMN IF NOT EXISTS ip_source TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS isp TEXT,
ADD COLUMN IF NOT EXISTS vpn_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tor_detected BOOLEAN DEFAULT FALSE;

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

-- 3. Create ip_security_logs table
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
    action TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_ip_hash ON public.ip_security_logs(ip_hash);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_user_id ON public.ip_security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_guest_id ON public.ip_security_logs(guest_id);
CREATE INDEX IF NOT EXISTS idx_ip_security_logs_created_at ON public.ip_security_logs(created_at);

-- 5. Enable RLS
ALTER TABLE public.ip_security_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view IP security logs" ON public.ip_security_logs;
DROP POLICY IF EXISTS "System can insert IP logs" ON public.ip_security_logs;

CREATE POLICY "Super admins can view IP security logs"
ON public.ip_security_logs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "System can insert IP logs"
ON public.ip_security_logs FOR INSERT WITH CHECK (true);

-- Verify columns were added
SELECT 'Step 1 complete - columns added' AS status;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'guests' AND column_name IN ('ip_hash', 'ip_encrypted', 'ip_source');
