-- =============================================
-- ENHANCED Admin Terminal RPC Function
-- Returns comprehensive user data
-- =============================================

CREATE OR REPLACE FUNCTION admin_get_user_full_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_post_count BIGINT := 0;
    v_comment_count BIGINT := 0;
    v_followers_count BIGINT := 0;
    v_following_count BIGINT := 0;
    v_reactions_received BIGINT := 0;
    v_total_views BIGINT := 0;
    v_email TEXT;
    v_security JSONB := NULL;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Get post count
    SELECT COUNT(*) INTO v_post_count FROM posts WHERE user_id = p_user_id;
    
    -- Get comment count
    SELECT COUNT(*) INTO v_comment_count FROM comments WHERE user_id = p_user_id;
    
    -- Get total views on user's posts
    BEGIN
        SELECT COALESCE(SUM(view_count), 0) INTO v_total_views FROM posts WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_column THEN
        v_total_views := 0;
    END;
    
    -- Get total reactions received on user's posts
    BEGIN
        SELECT COUNT(*) INTO v_reactions_received 
        FROM reactions r
        JOIN posts p ON r.post_id = p.id
        WHERE p.user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN
        v_reactions_received := 0;
    END;
    
    -- Get followers count
    BEGIN
        SELECT COUNT(*) INTO v_followers_count FROM follows WHERE following_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN
        v_followers_count := 0;
    END;
    
    -- Get following count
    BEGIN
        SELECT COUNT(*) INTO v_following_count FROM follows WHERE follower_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN
        v_following_count := 0;
    END;
    
    -- Get email from auth.users
    BEGIN
        SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
    EXCEPTION WHEN insufficient_privilege THEN
        v_email := NULL;
    END;
    
    -- Get security data from ip_security_logs
    BEGIN
        SELECT jsonb_build_object(
            'real_ip', isl.real_ip,
            'ip_fingerprint', isl.ip_fingerprint,
            'country', isl.country,
            'city', isl.city,
            'isp', isl.isp,
            'vpn_detected', isl.vpn_detected,
            'first_seen_at', isl.first_seen_at,
            'last_seen_at', isl.last_seen_at,
            'request_headers', isl.request_headers
        ) INTO v_security
        FROM ip_security_logs isl
        WHERE isl.user_id = p_user_id
        ORDER BY isl.last_seen_at DESC
        LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
        v_security := NULL;
    WHEN undefined_column THEN
        v_security := NULL;
    END;
    
    SELECT jsonb_build_object(
        'user_id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'email', COALESCE(v_email, 'N/A'),
        'role', p.role,
        'bio', p.bio,
        'avatar_url', p.avatar_url,
        'created_at', p.created_at,
        'last_seen', p.last_seen,
        'post_count', v_post_count,
        'comment_count', v_comment_count,
        'followers_count', v_followers_count,
        'following_count', v_following_count,
        'reactions_received', v_reactions_received,
        'total_views', v_total_views,
        'security_data', v_security
    ) INTO v_result
    FROM profiles p
    WHERE p.id = p_user_id;
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_user_full_data TO authenticated;
