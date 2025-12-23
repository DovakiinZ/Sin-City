-- Admin IP Actions & Blocking System
-- Implements blocked_ips table, management functions, and RLS enforcement

-- ============================================================================
-- 1. BLOCKED IPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blocked_ips (
    ip_address TEXT PRIMARY KEY,
    reason TEXT,
    blocked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do EVERYTHING on blocked_ips
DROP POLICY IF EXISTS "Admins can manage blocked IPs" ON public.blocked_ips;
CREATE POLICY "Admins can manage blocked IPs"
ON public.blocked_ips
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() 
    AND role IN ('admin', 'super_admin')
  )
);

-- Policy: No public access (Implicit deny, but let's be explicit if needed, 
-- though 'deny all' is default if no policy matches).

-- ============================================================================
-- 2. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if an IP is blocked (Security Definer to bypass RLS on blocked_ips for regular users)
CREATE OR REPLACE FUNCTION is_ip_blocked(p_ip TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip_address = p_ip);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to block an IP (Admin only logic effectively handled by RLS on insert, but wrapper helps)
CREATE OR REPLACE FUNCTION block_ip(
    p_ip TEXT, 
    p_reason TEXT DEFAULT 'Administrative Block'
)
RETURNS VOID AS $$
BEGIN
    -- Check Authorization (Double check in function for safety)
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
        AND role IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can block IPs';
    END IF;

    INSERT INTO public.blocked_ips (ip_address, reason, blocked_by)
    VALUES (p_ip, p_reason, auth.uid())
    ON CONFLICT (ip_address) 
    DO UPDATE SET 
        reason = EXCLUDED.reason,
        blocked_by = EXCLUDED.blocked_by,
        created_at = NOW(); -- Refresh timestamp on re-block
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unblock IP
CREATE OR REPLACE FUNCTION unblock_ip(p_ip TEXT)
RETURNS VOID AS $$
BEGIN
     -- Check Authorization
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() 
        AND role IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only admins can unblock IPs';
    END IF;

    DELETE FROM public.blocked_ips WHERE ip_address = p_ip;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users (logic inside checks role)
GRANT EXECUTE ON FUNCTION block_ip TO authenticated;
GRANT EXECUTE ON FUNCTION unblock_ip TO authenticated;
GRANT EXECUTE ON FUNCTION is_ip_blocked TO anon, authenticated;


-- ============================================================================
-- 3. ENFORCEMENT POLICIES
-- ============================================================================

-- Protect POSTS table: Prevent INSERT if IP is blocked
-- Note: existing policies on posts probably allow insert for authenticated/guests.
-- We need a restrictive policy or to update existing ones. 
-- Since policies are permissive (OR), adding a "DENY" is not straightforward in standard RLS 
-- unless using "WITH CHECK" on the permissive policy or a separate trigger.
-- Supabase/Postgres RLS is "allow at least one". It doesn't have "deny".
-- SO: We must ensure all INSERT policies enforce the check, OR use a Trigger.
-- A Trigger is safer and cleaner for "Global Deny" rules.

CREATE OR REPLACE FUNCTION enforce_ip_block()
RETURNS TRIGGER AS $$
DECLARE
    v_ip TEXT;
BEGIN
    v_ip := get_request_ip();
    
    IF is_ip_blocked(v_ip) THEN
        RAISE EXCEPTION 'Access Denied: Your IP address has been blocked.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply Trigger to POSTS (Before Insert)
DROP TRIGGER IF EXISTS trigger_enforce_ip_block_posts ON public.posts;
CREATE TRIGGER trigger_enforce_ip_block_posts
    BEFORE INSERT ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION enforce_ip_block();

-- Apply Trigger to COMMENTS (Before Insert)
DROP TRIGGER IF EXISTS trigger_enforce_ip_block_comments ON public.comments;
CREATE TRIGGER trigger_enforce_ip_block_comments
    BEFORE INSERT ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION enforce_ip_block();
