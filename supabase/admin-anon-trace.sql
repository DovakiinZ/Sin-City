-- ============================================================================
-- ADMIN ANON TRACE COMMANDS
-- Enhanced investigation tools for anonymous identity tracking
-- ============================================================================

-- ============================================================================
-- 1. SUDO ANON --TRACE <anon_id>
-- Full trace of an anonymous user: all IPs, activity, content, related accounts
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_trace_anon(p_anon_identifier TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guest_id UUID;
    v_guest RECORD;
    v_result JSONB;
    v_ip_history JSONB;
    v_activity JSONB;
    v_posts JSONB;
    v_comments JSONB;
    v_related_accounts JSONB;
    v_merged_info JSONB;
    v_security_logs JSONB;
BEGIN
    -- Verify admin access
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Find guest by various identifiers
    SELECT id INTO v_guest_id FROM public.guests 
    WHERE id::TEXT = p_anon_identifier
       OR anonymous_id = p_anon_identifier
       OR fingerprint = p_anon_identifier
       OR anon_token = p_anon_identifier
    LIMIT 1;

    IF v_guest_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Anonymous user not found',
            'searched_for', p_anon_identifier
        );
    END IF;

    -- Get guest record
    SELECT * INTO v_guest FROM public.guests WHERE id = v_guest_id;

    -- =========================================================================
    -- IP HISTORY from guest record
    -- =========================================================================
    v_ip_history := COALESCE(v_guest.ip_history, '[]'::jsonb);

    -- =========================================================================
    -- SECURITY LOGS (detailed IP tracking)
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'real_ip', isl.real_ip,
            'ip_hash', isl.ip_hash,
            'ip_fingerprint', isl.ip_fingerprint,
            'country', isl.country,
            'city', isl.city,
            'isp', isl.isp,
            'vpn_detected', COALESCE(isl.vpn_detected, false),
            'action', isl.action,
            'first_seen', isl.first_seen_at,
            'last_seen', isl.last_seen_at
        ) ORDER BY isl.last_seen_at DESC
    ), '[]'::jsonb) INTO v_security_logs
    FROM public.ip_security_logs isl
    WHERE isl.guest_id = v_guest_id;

    -- =========================================================================
    -- ACTIVITY LOGS
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'action', al.action,
            'target_type', al.target_type,
            'target_id', al.target_id,
            'target_metadata', al.target_metadata,
            'ip_address', al.ip_address,
            'geo_info', al.geo_info,
            'created_at', al.created_at
        ) ORDER BY al.created_at DESC
    ), '[]'::jsonb) INTO v_activity
    FROM public.activity_logs al
    WHERE al.actor_type = 'anon' AND al.actor_id = v_guest_id
    LIMIT 100;

    -- =========================================================================
    -- POSTS by this anon
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'title', p.title,
            'content_preview', LEFT(p.content, 150),
            'slug', p.slug,
            'type', p.type,
            'created_at', p.created_at,
            'view_count', COALESCE(p.view_count, 0),
            'hidden', COALESCE(p.hidden, false)
        ) ORDER BY p.created_at DESC
    ), '[]'::jsonb) INTO v_posts
    FROM public.posts p
    WHERE p.guest_id = v_guest_id;

    -- =========================================================================
    -- COMMENTS by this anon
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'content_preview', LEFT(c.content, 150),
            'post_id', c.post_id,
            'created_at', c.created_at
        ) ORDER BY c.created_at DESC
    ), '[]'::jsonb) INTO v_comments
    FROM public.comments c
    WHERE c.guest_id = v_guest_id;

    -- =========================================================================
    -- RELATED ACCOUNTS (same IP or fingerprint)
    -- =========================================================================
    SELECT COALESCE(jsonb_agg(DISTINCT
        jsonb_build_object(
            'type', 'guest',
            'id', g.id,
            'anonymous_id', g.anonymous_id,
            'fingerprint', g.fingerprint,
            'status', g.status,
            'post_count', g.post_count,
            'relation', CASE 
                WHEN g.fingerprint = v_guest.fingerprint THEN 'same_fingerprint'
                ELSE 'same_ip'
            END
        )
    ), '[]'::jsonb) INTO v_related_accounts
    FROM public.guests g
    WHERE g.id != v_guest_id
      AND (
          -- Same fingerprint
          g.fingerprint = v_guest.fingerprint
          -- Or overlapping IP history
          OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(g.ip_history) AS g_ip,
                           jsonb_array_elements(v_guest.ip_history) AS v_ip
              WHERE g_ip->>'ip' = v_ip->>'ip'
          )
          -- Or same IP in security logs
          OR g.id IN (
              SELECT isl2.guest_id 
              FROM public.ip_security_logs isl1
              JOIN public.ip_security_logs isl2 ON isl1.real_ip = isl2.real_ip
              WHERE isl1.guest_id = v_guest_id
                AND isl2.guest_id != v_guest_id
          )
      );

    -- Check for related registered users
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'type', 'user',
            'id', p.id,
            'username', p.username,
            'relation', 'same_ip'
        )
    ), '[]'::jsonb) || v_related_accounts INTO v_related_accounts
    FROM public.profiles p
    WHERE p.id IN (
        SELECT isl2.user_id 
        FROM public.ip_security_logs isl1
        JOIN public.ip_security_logs isl2 ON isl1.real_ip = isl2.real_ip
        WHERE isl1.guest_id = v_guest_id
          AND isl2.user_id IS NOT NULL
    );

    -- =========================================================================
    -- MERGE INFO (if merged)
    -- =========================================================================
    IF v_guest.merged_user_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'merged_to_user_id', v_guest.merged_user_id,
            'merged_at', v_guest.merged_at,
            'merged_to_username', p.username
        ) INTO v_merged_info
        FROM public.profiles p
        WHERE p.id = v_guest.merged_user_id;
    ELSE
        v_merged_info := NULL;
    END IF;

    -- =========================================================================
    -- BUILD COMPLETE TRACE RESULT
    -- =========================================================================
    v_result := jsonb_build_object(
        'success', true,
        'trace_timestamp', NOW(),
        'target', jsonb_build_object(
            'guest_id', v_guest.id,
            'anonymous_id', v_guest.anonymous_id,
            'fingerprint', v_guest.fingerprint,
            'fingerprint_hash', v_guest.fingerprint_hash,
            'anon_token', LEFT(v_guest.anon_token, 8) || '...',  -- Truncate for security
            'email', v_guest.email,
            'email_verified', COALESCE(v_guest.email_verified, false),
            'status', v_guest.status,
            'trust_score', v_guest.trust_score,
            'flags', v_guest.flags,
            'post_count', v_guest.post_count,
            'comment_count', v_guest.comment_count,
            'first_seen_at', v_guest.first_seen_at,
            'last_seen_at', v_guest.last_seen_at,
            'device_info', v_guest.device_info,
            'notes', v_guest.notes
        ),
        'network', jsonb_build_object(
            'current_ip_hash', v_guest.ip_hash,
            'country', v_guest.country,
            'city', v_guest.city,
            'isp', v_guest.isp,
            'vpn_detected', COALESCE(v_guest.vpn_detected, false),
            'tor_detected', COALESCE(v_guest.tor_detected, false),
            'ip_history', v_ip_history,
            'security_logs', v_security_logs
        ),
        'content', jsonb_build_object(
            'posts', v_posts,
            'posts_count', jsonb_array_length(v_posts),
            'comments', v_comments,
            'comments_count', jsonb_array_length(v_comments)
        ),
        'activity_logs', v_activity,
        'related_accounts', v_related_accounts,
        'merge_info', v_merged_info,
        'soft_links', jsonb_build_object(
            'linked_from', v_guest.soft_linked_from,
            'link_trust_score', v_guest.soft_link_trust_score
        )
    );

    -- Log admin access
    INSERT INTO public.activity_logs (
        actor_type, actor_id, action,
        target_type, target_id, target_metadata
    ) VALUES (
        'user', auth.uid(), 'admin_trace',
        'anon', v_guest_id,
        jsonb_build_object('command', 'sudo anon --trace')
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_trace_anon TO authenticated;

-- ============================================================================
-- 2. TIMELINE REPLAY <anon_id>
-- Chronological view of all activity with activity_logs integration
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_timeline_replay(
    p_entity_type TEXT,  -- 'anon' or 'user'
    p_entity_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_entity_id UUID;
    v_events JSONB;
    v_actor_type TEXT;
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Resolve entity ID
    IF p_entity_type = 'anon' THEN
        v_actor_type := 'anon';
        SELECT id INTO v_entity_id FROM public.guests 
        WHERE id::TEXT = p_entity_identifier
           OR anonymous_id = p_entity_identifier
           OR fingerprint = p_entity_identifier;
    ELSIF p_entity_type = 'user' THEN
        v_actor_type := 'user';
        SELECT id INTO v_entity_id FROM public.profiles 
        WHERE id::TEXT = p_entity_identifier
           OR username = p_entity_identifier;
    ELSE
        RETURN jsonb_build_object('error', 'Invalid entity type. Use "anon" or "user"');
    END IF;

    IF v_entity_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Entity not found', 'searched_for', p_entity_identifier);
    END IF;

    -- Get all events from activity_logs + legacy sources
    WITH all_events AS (
        -- Activity logs (primary source)
        SELECT 
            al.created_at as event_time,
            al.action as event_type,
            al.action || COALESCE(': ' || al.target_type, '') as description,
            jsonb_build_object(
                'target_id', al.target_id,
                'ip', al.ip_address,
                'geo', al.geo_info,
                'metadata', al.target_metadata
            ) as metadata,
            'activity_log' as source
        FROM public.activity_logs al
        WHERE al.actor_type = v_actor_type AND al.actor_id = v_entity_id

        UNION ALL

        -- Posts (if not in activity_logs)
        SELECT 
            p.created_at as event_time,
            'post_create' as event_type,
            'Created post: ' || COALESCE(LEFT(p.title, 40), 'Untitled') as description,
            jsonb_build_object('post_id', p.id, 'slug', p.slug, 'hidden', p.hidden) as metadata,
            'posts_table' as source
        FROM public.posts p
        WHERE (v_actor_type = 'anon' AND p.guest_id = v_entity_id)
           OR (v_actor_type = 'user' AND p.user_id = v_entity_id)

        UNION ALL

        -- Comments (if not in activity_logs)
        SELECT 
            c.created_at as event_time,
            'comment_create' as event_type,
            'Commented: ' || LEFT(c.content, 50) || '...' as description,
            jsonb_build_object('comment_id', c.id, 'post_id', c.post_id) as metadata,
            'comments_table' as source
        FROM public.comments c
        WHERE (v_actor_type = 'anon' AND c.guest_id = v_entity_id)
           OR (v_actor_type = 'user' AND c.user_id = v_entity_id)

        UNION ALL

        -- IP security logs
        SELECT 
            isl.last_seen_at as event_time,
            'ip_activity' as event_type,
            'IP activity from ' || COALESCE(isl.city, 'Unknown') || ', ' || COALESCE(isl.country, 'Unknown') as description,
            jsonb_build_object(
                'ip', isl.real_ip, 
                'vpn', isl.vpn_detected,
                'action', isl.action
            ) as metadata,
            'ip_security_logs' as source
        FROM public.ip_security_logs isl
        WHERE (v_actor_type = 'anon' AND isl.guest_id = v_entity_id)
           OR (v_actor_type = 'user' AND isl.user_id = v_entity_id)

        ORDER BY event_time DESC
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'timestamp', event_time,
            'type', event_type,
            'description', description,
            'metadata', metadata,
            'source', source
        )
    ), '[]'::jsonb) INTO v_events
    FROM all_events
    LIMIT 500;

    RETURN jsonb_build_object(
        'entity_type', p_entity_type,
        'entity_id', v_entity_id,
        'event_count', jsonb_array_length(v_events),
        'events', v_events,
        'generated_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_timeline_replay TO authenticated;

-- ============================================================================
-- 3. FIND BY IP
-- Find all identities associated with a specific IP
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_find_by_ip(p_ip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guests JSONB;
    v_users JSONB;
    v_posts JSONB;
    v_activity JSONB;
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Find guests
    SELECT COALESCE(jsonb_agg(DISTINCT
        jsonb_build_object(
            'guest_id', g.id,
            'anonymous_id', g.anonymous_id,
            'status', g.status,
            'trust_score', g.trust_score,
            'post_count', g.post_count,
            'first_seen', g.first_seen_at,
            'last_seen', g.last_seen_at
        )
    ), '[]'::jsonb) INTO v_guests
    FROM public.guests g
    LEFT JOIN public.ip_security_logs isl ON isl.guest_id = g.id
    WHERE isl.real_ip = p_ip
       OR g.ip_history @> jsonb_build_array(jsonb_build_object('ip', p_ip));

    -- Find users
    SELECT COALESCE(jsonb_agg(DISTINCT
        jsonb_build_object(
            'user_id', p.id,
            'username', p.username,
            'role', p.role,
            'last_seen', isl.last_seen_at
        )
    ), '[]'::jsonb) INTO v_users
    FROM public.ip_security_logs isl
    JOIN public.profiles p ON p.id = isl.user_id
    WHERE isl.real_ip = p_ip AND isl.user_id IS NOT NULL;

    -- Find posts
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'post_id', al.target_id,
            'action', al.action,
            'actor_type', al.actor_type,
            'actor_id', al.actor_id,
            'created_at', al.created_at
        )
    ), '[]'::jsonb) INTO v_posts
    FROM public.activity_logs al
    WHERE al.ip_address = p_ip
      AND al.action IN ('post_create', 'comment_create')
    LIMIT 50;

    -- Get all activity from this IP
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'action', al.action,
            'actor_type', al.actor_type,
            'actor_id', al.actor_id,
            'target_type', al.target_type,
            'created_at', al.created_at
        ) ORDER BY al.created_at DESC
    ), '[]'::jsonb) INTO v_activity
    FROM public.activity_logs al
    WHERE al.ip_address = p_ip
    LIMIT 100;

    -- Log access
    INSERT INTO public.activity_logs (
        actor_type, actor_id, action,
        target_metadata
    ) VALUES (
        'user', auth.uid(), 'admin_ip_lookup',
        jsonb_build_object('ip_searched', p_ip)
    );

    RETURN jsonb_build_object(
        'ip', p_ip,
        'guests', v_guests,
        'guests_count', jsonb_array_length(v_guests),
        'users', v_users,
        'users_count', jsonb_array_length(v_users),
        'content', v_posts,
        'activity', v_activity,
        'generated_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_find_by_ip TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION admin_trace_anon IS 'Full trace of anonymous user: IPs, activity, content, related accounts';
COMMENT ON FUNCTION admin_timeline_replay IS 'Chronological activity timeline for any entity';
COMMENT ON FUNCTION admin_find_by_ip IS 'Find all identities and activity associated with an IP';

SELECT 'Admin trace commands complete!' AS status;
