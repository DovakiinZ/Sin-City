-- =============================================
-- Admin Terminal Audit Logs
-- Tracks all commands executed via the admin post terminal
-- =============================================

-- Create the admin_terminal_logs table
CREATE TABLE IF NOT EXISTS admin_terminal_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_guest_id UUID, -- References guests table (no FK to allow flexibility)
    post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
    command TEXT NOT NULL,
    command_args JSONB DEFAULT '{}',
    result_summary TEXT,
    action_taken TEXT CHECK (action_taken IN ('ban', 'unban', 'restrict', 'unrestrict', 'verify', 'delete', 'hide', 'show', NULL)),
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by admin
CREATE INDEX IF NOT EXISTS idx_admin_terminal_logs_admin_id ON admin_terminal_logs(admin_id);

-- Index for lookups by target user
CREATE INDEX IF NOT EXISTS idx_admin_terminal_logs_target_user ON admin_terminal_logs(target_user_id);

-- Index for lookups by target guest
CREATE INDEX IF NOT EXISTS idx_admin_terminal_logs_target_guest ON admin_terminal_logs(target_guest_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_admin_terminal_logs_created_at ON admin_terminal_logs(created_at DESC);

-- RLS Policies
ALTER TABLE admin_terminal_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view all terminal logs"
    ON admin_terminal_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Only admins can insert logs (via their own actions)
CREATE POLICY "Admins can insert terminal logs"
    ON admin_terminal_logs
    FOR INSERT
    WITH CHECK (
        admin_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- No updates or deletes allowed (audit trail must be immutable)
-- (No UPDATE or DELETE policies)

-- =============================================
-- RPC Function: Log admin terminal command
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
    -- Verify caller is admin
    SELECT id INTO v_admin_id
    FROM profiles
    WHERE id = auth.uid() AND role = 'admin';
    
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Insert log entry
    INSERT INTO admin_terminal_logs (
        admin_id,
        target_user_id,
        target_guest_id,
        post_id,
        command,
        command_args,
        result_summary,
        action_taken,
        success
    ) VALUES (
        v_admin_id,
        p_target_user_id,
        p_target_guest_id,
        p_post_id,
        p_command,
        p_command_args,
        p_result_summary,
        p_action_taken,
        p_success
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- Grant execute to authenticated users (function checks admin internally)
GRANT EXECUTE ON FUNCTION log_admin_terminal_command TO authenticated;

-- =============================================
-- RPC Function: Get full user data for admin terminal
-- =============================================
CREATE OR REPLACE FUNCTION admin_get_user_full_data(p_user_id UUID)
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
        'user_id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'email', u.email,
        'role', p.role,
        'bio', p.bio,
        'avatar_url', p.avatar_url,
        'created_at', p.created_at,
        'last_seen', p.last_seen,
        'post_count', (SELECT COUNT(*) FROM posts WHERE user_id = p.id),
        'comment_count', (SELECT COUNT(*) FROM comments WHERE user_id = p.id),
        'followers_count', (SELECT COUNT(*) FROM follows WHERE following_id = p.id),
        'following_count', (SELECT COUNT(*) FROM follows WHERE follower_id = p.id),
        'security_data', (
            SELECT jsonb_build_object(
                'real_ip', sl.real_ip,
                'ip_fingerprint', sl.ip_fingerprint,
                'last_seen_at', sl.last_seen_at,
                'is_blocked', sl.is_blocked
            )
            FROM security_logs sl
            WHERE sl.user_id = p.id
            ORDER BY sl.last_seen_at DESC
            LIMIT 1
        )
    ) INTO v_result
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user_id;
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_user_full_data TO authenticated;

-- =============================================
-- RPC Function: Get full guest data for admin terminal
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
        'email_verified', g.email_verified,
        'device_info', g.device_info,
        'network_info', g.network_info,
        'post_count', g.post_count,
        'comment_count', g.comment_count,
        'page_views', g.page_views,
        'trust_score', g.trust_score,
        'flags', g.flags,
        'status', g.status,
        'first_seen_at', g.first_seen_at,
        'last_seen_at', g.last_seen_at,
        'blocked_at', g.blocked_at,
        'notes', g.notes,
        'security_data', (
            SELECT jsonb_build_object(
                'real_ip', sl.real_ip,
                'ip_fingerprint', sl.ip_fingerprint,
                'last_seen_at', sl.last_seen_at,
                'is_blocked', sl.is_blocked
            )
            FROM security_logs sl
            WHERE sl.guest_id = g.id::text
            ORDER BY sl.last_seen_at DESC
            LIMIT 1
        )
    ) INTO v_result
    FROM guests g
    WHERE g.id = p_guest_id;
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_guest_full_data TO authenticated;

-- =============================================
-- RPC Function: Get post author info (user or guest)
-- =============================================
CREATE OR REPLACE FUNCTION admin_get_post_author_info(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_post RECORD;
    v_result JSONB;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Get post info
    SELECT user_id, guest_id INTO v_post
    FROM posts
    WHERE id = p_post_id;
    
    IF v_post IS NULL THEN
        RETURN jsonb_build_object('error', 'Post not found');
    END IF;
    
    -- Return author type and ID
    IF v_post.user_id IS NOT NULL THEN
        v_result := jsonb_build_object(
            'author_type', 'user',
            'author_id', v_post.user_id
        );
    ELSIF v_post.guest_id IS NOT NULL THEN
        v_result := jsonb_build_object(
            'author_type', 'guest',
            'author_id', v_post.guest_id
        );
    ELSE
        v_result := jsonb_build_object(
            'author_type', 'unknown',
            'author_id', NULL
        );
    END IF;
    
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_post_author_info TO authenticated;
