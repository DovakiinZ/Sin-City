-- ==============================================================================
-- ADMIN USER DETAILS & TIMELINE
-- ==============================================================================

-- 1. User Timeline RPC
-- Combines Posts, Comments, and Security Logs into a single stream for a registered user
CREATE OR REPLACE FUNCTION get_user_timeline(p_user_id UUID)
RETURNS TABLE (
    id TEXT,
    type TEXT, -- 'post', 'comment', 'security_log'
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
    WHERE p.user_id = p_user_id
    
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
    WHERE c.user_id = p_user_id
    
    UNION ALL
    
    -- Security Logs (IP appearances)
    SELECT 
        isl.id::TEXT,
        'security_log'::TEXT as type,
        ('Seen at IP: ' || isl.real_ip)::TEXT as summary,
        jsonb_build_object('fingerprint', isl.ip_fingerprint, 'city', isl.city, 'country', isl.country) as details,
        isl.last_seen_at as created_at
    FROM ip_security_logs isl
    WHERE isl.user_id = p_user_id
    
    ORDER BY created_at DESC
    LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_timeline TO authenticated;
