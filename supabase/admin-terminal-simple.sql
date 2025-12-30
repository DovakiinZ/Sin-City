-- =============================================
-- Simpler RPC Function: Get user data for admin terminal
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
    
    -- Get comment count (use 0 if comments table has issues)
    SELECT COUNT(*) INTO v_comment_count FROM comments WHERE user_id = p_user_id;
    
    SELECT jsonb_build_object(
        'user_id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'email', p.email,
        'role', p.role,
        'bio', p.bio,
        'avatar_url', p.avatar_url,
        'created_at', p.created_at,
        'last_seen', p.last_seen,
        'post_count', v_post_count,
        'comment_count', v_comment_count,
        'followers_count', 0,
        'following_count', 0,
        'security_data', NULL
    ) INTO v_result
    FROM profiles p
    WHERE p.id = p_user_id;
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_user_full_data TO authenticated;

-- =============================================
-- Simpler RPC Function: Get guest data for admin terminal
-- =============================================
CREATE OR REPLACE FUNCTION admin_get_guest_full_data(p_guest_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    SELECT jsonb_build_object(
        'guest_id', g.id,
        'fingerprint', g.fingerprint,
        'fingerprint_hash', g.fingerprint_hash,
        'session_id', g.session_id,
        'email', g.email,
        'email_verified', COALESCE(g.email_verified, false),
        'device_info', g.device_info,
        'network_info', g.network_info,
        'post_count', COALESCE(g.post_count, 0),
        'comment_count', COALESCE(g.comment_count, 0),
        'page_views', COALESCE(g.page_views, 0),
        'trust_score', COALESCE(g.trust_score, 50),
        'flags', COALESCE(g.flags, '{}'),
        'status', COALESCE(g.status, 'active'),
        'first_seen_at', g.first_seen_at,
        'last_seen_at', g.last_seen_at,
        'blocked_at', g.blocked_at,
        'notes', g.notes,
        'security_data', NULL
    ) INTO v_result
    FROM guests g
    WHERE g.id = p_guest_id;
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_guest_full_data TO authenticated;

-- =============================================
-- Simpler RPC Function: Get post author info
-- =============================================
CREATE OR REPLACE FUNCTION admin_get_post_author_info(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_guest_id UUID;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Get post author info
    SELECT user_id, guest_id INTO v_user_id, v_guest_id
    FROM posts
    WHERE id = p_post_id;
    
    IF v_user_id IS NOT NULL THEN
        RETURN jsonb_build_object('author_type', 'user', 'author_id', v_user_id);
    ELSIF v_guest_id IS NOT NULL THEN
        RETURN jsonb_build_object('author_type', 'guest', 'author_id', v_guest_id);
    ELSE
        RETURN jsonb_build_object('author_type', 'unknown', 'author_id', NULL);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_post_author_info TO authenticated;

-- =============================================
-- Log command function
-- =============================================
CREATE OR REPLACE FUNCTION log_admin_terminal_command(
    p_target_user_id UUID DEFAULT NULL,
    p_target_guest_id UUID DEFAULT NULL,
    p_post_id UUID DEFAULT NULL,
    p_command TEXT DEFAULT '',
    p_command_args JSONB DEFAULT '{}',
    p_result_summary TEXT DEFAULT NULL,
    p_action_taken TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID;
    v_log_id UUID;
BEGIN
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE id = auth.uid() AND role = 'admin';
    
    IF v_admin_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    INSERT INTO admin_terminal_logs (
        admin_id, target_user_id, target_guest_id, post_id,
        command, command_args, result_summary, action_taken, success
    ) VALUES (
        v_admin_id, p_target_user_id, p_target_guest_id, p_post_id,
        p_command, p_command_args, p_result_summary, p_action_taken, p_success
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_admin_terminal_command TO authenticated;
