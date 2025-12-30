-- =============================================
-- Timeline Replay Function
-- Chronological activity view for any entity
-- =============================================

CREATE OR REPLACE FUNCTION admin_get_entity_timeline(
    p_entity_type TEXT,  -- 'guest' or 'user'
    p_entity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_events JSONB;
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    IF p_entity_type = 'guest' THEN
        -- Guest timeline
        WITH all_events AS (
            -- First seen
            SELECT 
                first_seen_at as event_time,
                'FIRST_SEEN' as event_type,
                'Guest first appeared' as description,
                jsonb_build_object('fingerprint', fingerprint) as metadata
            FROM guests WHERE id = p_entity_id
            
            UNION ALL
            
            -- Posts
            SELECT 
                created_at as event_time,
                'POST_CREATED' as event_type,
                'Created post: ' || COALESCE(LEFT(title, 40), 'Untitled') as description,
                jsonb_build_object('post_id', id, 'hidden', COALESCE(hidden, false)) as metadata
            FROM posts WHERE guest_id = p_entity_id
            
            UNION ALL
            
            -- Comments
            SELECT 
                created_at as event_time,
                'COMMENT_CREATED' as event_type,
                'Commented: ' || LEFT(content, 40) || '...' as description,
                jsonb_build_object('comment_id', id, 'post_id', post_id) as metadata
            FROM comments WHERE guest_id = p_entity_id
            
            UNION ALL
            
            -- IP logging events
            SELECT 
                last_seen_at as event_time,
                'IP_LOGGED' as event_type,
                'IP activity from ' || COALESCE(city, 'Unknown') || ', ' || COALESCE(country, 'Unknown') as description,
                jsonb_build_object(
                    'ip', real_ip, 
                    'vpn', COALESCE(vpn_detected, false),
                    'isp', isp
                ) as metadata
            FROM ip_security_logs WHERE guest_id = p_entity_id
            
            UNION ALL
            
            -- Status changes (if blocked)
            SELECT 
                blocked_at as event_time,
                'STATUS_CHANGE' as event_type,
                'Status changed to: BLOCKED' as description,
                jsonb_build_object('new_status', 'blocked') as metadata
            FROM guests WHERE id = p_entity_id AND blocked_at IS NOT NULL
            
            ORDER BY event_time DESC
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'timestamp', event_time,
                'type', event_type,
                'description', description,
                'metadata', metadata
            )
        ), '[]'::jsonb) INTO v_events
        FROM all_events
        LIMIT 100;
        
    ELSIF p_entity_type = 'user' THEN
        -- User timeline
        WITH all_events AS (
            -- Account created
            SELECT 
                created_at as event_time,
                'ACCOUNT_CREATED' as event_type,
                'User account created' as description,
                jsonb_build_object('username', username, 'role', role) as metadata
            FROM profiles WHERE id = p_entity_id
            
            UNION ALL
            
            -- Posts
            SELECT 
                created_at as event_time,
                'POST_CREATED' as event_type,
                'Created post: ' || COALESCE(LEFT(title, 40), 'Untitled') as description,
                jsonb_build_object('post_id', id, 'hidden', COALESCE(hidden, false)) as metadata
            FROM posts WHERE user_id = p_entity_id
            
            UNION ALL
            
            -- Comments
            SELECT 
                created_at as event_time,
                'COMMENT_CREATED' as event_type,
                'Commented: ' || LEFT(content, 40) || '...' as description,
                jsonb_build_object('comment_id', id, 'post_id', post_id) as metadata
            FROM comments WHERE user_id = p_entity_id
            
            UNION ALL
            
            -- Last seen
            SELECT 
                last_seen as event_time,
                'LAST_SEEN' as event_type,
                'Last activity recorded' as description,
                '{}'::jsonb as metadata
            FROM profiles WHERE id = p_entity_id AND last_seen IS NOT NULL
            
            UNION ALL
            
            -- IP logs
            SELECT 
                last_seen_at as event_time,
                'IP_LOGGED' as event_type,
                'IP activity from ' || COALESCE(city, 'Unknown') || ', ' || COALESCE(country, 'Unknown') as description,
                jsonb_build_object(
                    'ip', real_ip,
                    'vpn', COALESCE(vpn_detected, false)
                ) as metadata
            FROM ip_security_logs WHERE user_id = p_entity_id
            
            ORDER BY event_time DESC
        )
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'timestamp', event_time,
                'type', event_type,
                'description', description,
                'metadata', metadata
            )
        ), '[]'::jsonb) INTO v_events
        FROM all_events
        LIMIT 100;
    ELSE
        RETURN jsonb_build_object('error', 'Invalid entity type. Use "guest" or "user"');
    END IF;

    RETURN jsonb_build_object(
        'entity_type', p_entity_type,
        'entity_id', p_entity_id,
        'event_count', jsonb_array_length(v_events),
        'events', v_events
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_entity_timeline TO authenticated;

-- =============================================
-- Trace IP Function
-- Find all entities associated with an IP
-- =============================================

CREATE OR REPLACE FUNCTION admin_trace_ip(p_ip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guests JSONB;
    v_users JSONB;
    v_posts JSONB;
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Find guests with this IP
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'guest_id', g.id,
            'fingerprint', g.fingerprint,
            'status', g.status,
            'post_count', g.post_count,
            'first_seen', g.first_seen_at,
            'last_seen', isl.last_seen_at
        )
    ), '[]'::jsonb) INTO v_guests
    FROM ip_security_logs isl
    JOIN guests g ON g.id = isl.guest_id
    WHERE isl.real_ip = p_ip;

    -- Find users with this IP
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'user_id', p.id,
            'username', p.username,
            'role', p.role,
            'last_seen', isl.last_seen_at
        )
    ), '[]'::jsonb) INTO v_users
    FROM ip_security_logs isl
    JOIN profiles p ON p.id = isl.user_id
    WHERE isl.real_ip = p_ip;

    -- Find posts from this IP (via guests)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'post_id', po.id,
            'title', po.title,
            'created_at', po.created_at,
            'author_type', CASE WHEN po.user_id IS NOT NULL THEN 'user' ELSE 'guest' END
        )
    ), '[]'::jsonb) INTO v_posts
    FROM posts po
    WHERE po.guest_id IN (
        SELECT guest_id FROM ip_security_logs WHERE real_ip = p_ip AND guest_id IS NOT NULL
    )
    OR po.user_id IN (
        SELECT user_id FROM ip_security_logs WHERE real_ip = p_ip AND user_id IS NOT NULL
    )
    LIMIT 50;

    RETURN jsonb_build_object(
        'ip', p_ip,
        'guests', v_guests,
        'users', v_users,
        'posts', v_posts,
        'total_guests', jsonb_array_length(v_guests),
        'total_users', jsonb_array_length(v_users),
        'total_posts', jsonb_array_length(v_posts)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_trace_ip TO authenticated;
