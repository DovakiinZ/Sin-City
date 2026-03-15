-- ==============================================================================
-- IP CONTENT ANALYSIS FUNCTIONS
-- ==============================================================================
-- These functions return content (posts/comments) associated with a specific Real IP.
-- Since we don't stamp every post with an IP (yet), we link via the Author.
-- Logic: Find all Guests/Users who have appeared in 'ip_security_logs' with this IP,
-- then fetch all their content. This is effective for finding "alts".

-- 1. Get Summary Stats for an IP
CREATE OR REPLACE FUNCTION get_ip_content_stats(p_ip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Bypass RLS to read logs and count content
SET search_path = public
AS $$
DECLARE
    v_guest_ids UUID[];
    v_user_ids UUID[];
    v_post_count INT;
    v_comment_count INT;
    v_guest_count INT;
    v_user_count INT;
BEGIN
    -- Check Admin Permissions
    IF NOT public.check_admin_access() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Get all Guest IDs linked to this IP
    SELECT ARRAY_AGG(DISTINCT guest_id)
    INTO v_guest_ids
    FROM ip_security_logs
    WHERE real_ip = p_ip AND guest_id IS NOT NULL;

    -- Get all User IDs linked to this IP
    SELECT ARRAY_AGG(DISTINCT user_id)
    INTO v_user_ids
    FROM ip_security_logs
    WHERE real_ip = p_ip AND user_id IS NOT NULL;

    -- Count distinct identities
    v_guest_count := COALESCE(ARRAY_LENGTH(v_guest_ids, 1), 0);
    v_user_count := COALESCE(ARRAY_LENGTH(v_user_ids, 1), 0);

    -- Count Posts by these authors
    SELECT COUNT(*)
    INTO v_post_count
    FROM posts
    WHERE author_id = ANY(v_guest_ids)
       OR (user_id = ANY(v_user_ids) AND user_id IS NOT NULL);

    -- Count Comments by these authors
    SELECT COUNT(*)
    INTO v_comment_count
    FROM comments
    WHERE guest_id = ANY(v_guest_ids)
       OR (user_id = ANY(v_user_ids) AND user_id IS NOT NULL);

    RETURN jsonb_build_object(
        'post_count', v_post_count,
        'comment_count', v_comment_count,
        'guest_count', v_guest_count,
        'user_count', v_user_count,
        'linked_guest_ids', v_guest_ids,
        'linked_user_ids', v_user_ids
    );
END;
$$;

-- 2. Get Posts by IP
CREATE OR REPLACE FUNCTION get_posts_by_ip(p_ip TEXT)
RETURNS TABLE (
    id UUID,
    title TEXT,
    excerpt TEXT,
    created_at TIMESTAMPTZ,
    status TEXT,
    author_type TEXT,
    author_id UUID,
    author_name TEXT, -- 'Guest #abcd' or Username
    author_label TEXT -- 'Guest' or 'User'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guest_ids UUID[];
    v_user_ids UUID[];
BEGIN
    -- Check Admin Permissions
    IF NOT public.check_admin_access() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Get IDs
    SELECT ARRAY_AGG(DISTINCT guest_id) INTO v_guest_ids
    FROM ip_security_logs WHERE real_ip = p_ip AND guest_id IS NOT NULL;

    SELECT ARRAY_AGG(DISTINCT user_id) INTO v_user_ids
    FROM ip_security_logs WHERE real_ip = p_ip AND user_id IS NOT NULL;

    RETURN QUERY
    -- Posts by Guests
    SELECT 
        p.id,
        p.title,
        LEFT(p.content, 100) as excerpt,
        p.created_at,
        p.status,
        'guest'::TEXT as author_type,
        p.author_id,
        ('Guest #' || LEFT(g.fingerprint, 8))::TEXT as author_name,
        'Guest'::TEXT as author_label
    FROM posts p
    JOIN guests g ON p.author_id = g.id
    WHERE p.author_id = ANY(v_guest_ids)
    
    UNION ALL
    
    -- Posts by Users
    SELECT 
        p.id,
        p.title,
        LEFT(p.content, 100) as excerpt,
        p.created_at,
        p.status,
        'user'::TEXT as author_type,
        p.user_id as author_id,
        pr.username::TEXT as author_name,
        ('User (' || pr.role || ')')::TEXT as author_label
    FROM posts p
    JOIN profiles pr ON p.user_id = pr.id
    WHERE p.user_id = ANY(v_user_ids)
    
    ORDER BY created_at DESC;
END;
$$;

-- 3. Get Comments by IP
CREATE OR REPLACE FUNCTION get_comments_by_ip(p_ip TEXT)
RETURNS TABLE (
    id UUID,
    content TEXT,
    post_id UUID,
    post_title TEXT,
    created_at TIMESTAMPTZ,
    author_type TEXT,
    author_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guest_ids UUID[];
    v_user_ids UUID[];
BEGIN
    -- Check Admin Permissions
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Get IDs
    SELECT ARRAY_AGG(DISTINCT guest_id) INTO v_guest_ids
    FROM ip_security_logs WHERE real_ip = p_ip AND guest_id IS NOT NULL;

    SELECT ARRAY_AGG(DISTINCT user_id) INTO v_user_ids
    FROM ip_security_logs WHERE real_ip = p_ip AND user_id IS NOT NULL;

    RETURN QUERY
    -- Comments by Guests
    SELECT 
        c.id,
        c.content,
        c.post_id,
        p.title as post_title,
        c.created_at,
        'guest'::TEXT as author_type,
        ('Guest #' || LEFT(g.fingerprint, 8))::TEXT as author_name
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    JOIN guests g ON c.guest_id = g.id
    WHERE c.guest_id = ANY(v_guest_ids)
    
    UNION ALL
    
    -- Comments by Users
    SELECT 
        c.id,
        c.content,
        c.post_id,
        p.title as post_title,
        c.created_at,
        'user'::TEXT as author_type,
        pr.username::TEXT as author_name
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    JOIN profiles pr ON c.user_id = pr.id
    WHERE c.user_id = ANY(v_user_ids)
    
    ORDER BY created_at DESC;
END;
$$;
