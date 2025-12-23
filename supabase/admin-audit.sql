-- ==============================================================================
-- ADMIN AUDIT LOGGING & GUEST TIMELINE
-- ==============================================================================

-- 1. Admin Audit Logs Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES auth.users(id) NOT NULL,
    action TEXT NOT NULL, -- 'reveal_ip', 'block_ip', 'delete_post', etc.
    target_type TEXT NOT NULL, -- 'guest', 'user', 'post', 'comment'
    target_id TEXT, -- ID of the target
    details JSONB, -- Extra info (e.g. reason, previous state)
    ip_address TEXT, -- Admin's IP (if captureable)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Secure the log table
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
    ON public.admin_audit_logs
    FOR SELECT
    TO authenticated
    USING (public.check_admin_access());

-- No update/delete policy - logs are immutable
-- Insert accessible via internal server functions or specific admin RPCs

-- 2. Log Admin Action RPC
CREATE OR REPLACE FUNCTION log_admin_action(
    p_action TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check Admin Permissions
    IF NOT public.check_admin_access() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details);
END;
$$;


-- 3. Guest Timeline RPC
-- Combines Posts, Comments, and Security Logs into a single stream
CREATE OR REPLACE FUNCTION get_guest_timeline(p_guest_id UUID)
RETURNS TABLE (
    id TEXT,
    type TEXT, -- 'post', 'comment', 'security_log', 'status_change', 'identity'
    summary TEXT,
    details JSONB,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check Admin Permissions
    IF NOT public.check_admin_access() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    -- Posts
    SELECT 
        p.id::TEXT,
        'post'::TEXT as type,
        ('Created post: ' || LEFT(p.title, 50))::TEXT as summary,
        jsonb_build_object('slug', p.slug, 'status', p.status) as details,
        p.created_at
    FROM posts p
    WHERE p.guest_id = p_guest_id
    
    UNION ALL
    
    -- Comments
    SELECT 
        c.id::TEXT,
        'comment'::TEXT as type,
        ('Commented on: ' || LEFT(p.title, 30))::TEXT as summary,
        jsonb_build_object('post_id', c.post_id, 'content', LEFT(c.content, 50)) as details,
        c.created_at
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    WHERE c.guest_id = p_guest_id
    
    UNION ALL
    
    -- Security Logs (IP appearances)
    SELECT 
        isl.id::TEXT,
        'security_log'::TEXT as type,
        ('Seen at IP: ' || isl.real_ip)::TEXT as summary,
        jsonb_build_object('fingerprint', isl.ip_fingerprint, 'city', isl.city, 'country', isl.country) as details,
        isl.last_seen_at as created_at
    FROM ip_security_logs isl
    WHERE isl.guest_id = p_guest_id
    
    ORDER BY created_at DESC
    LIMIT 100; -- Cap at 100 items for performance
END;
$$;
