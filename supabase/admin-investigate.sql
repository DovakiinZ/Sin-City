-- =============================================
-- Admin Auto-Investigate System
-- Comprehensive investigation of anonymous users
-- =============================================

-- Main investigation function
CREATE OR REPLACE FUNCTION admin_auto_investigate_anon(p_guest_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_guest_info JSONB;
    v_security_info JSONB;
    v_posts JSONB;
    v_comments JSONB;
    v_patterns JSONB;
    v_risk_factors JSONB[];
    v_ip_history JSONB;
    v_session_history JSONB;
BEGIN
    -- Verify caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- 1. Get guest basic info
    SELECT jsonb_build_object(
        'guest_id', g.id,
        'fingerprint', g.fingerprint,
        'fingerprint_hash', g.fingerprint_hash,
        'email', g.email,
        'email_verified', COALESCE(g.email_verified, false),
        'status', COALESCE(g.status, 'active'),
        'trust_score', COALESCE(g.trust_score, 50),
        'post_count', COALESCE(g.post_count, 0),
        'comment_count', COALESCE(g.comment_count, 0),
        'page_views', COALESCE(g.page_views, 0),
        'first_seen_at', g.first_seen_at,
        'last_seen_at', g.last_seen_at,
        'blocked_at', g.blocked_at,
        'flags', COALESCE(g.flags, '[]'::jsonb),
        'notes', g.notes,
        'device_info', g.device_info,
        'network_info', g.network_info
    ) INTO v_guest_info
    FROM guests g
    WHERE g.id = p_guest_id;

    IF v_guest_info IS NULL THEN
        RETURN jsonb_build_object('error', 'Guest not found', 'guest_id', p_guest_id);
    END IF;

    -- 2. Get security/IP info
    SELECT jsonb_build_object(
        'real_ip', isl.real_ip,
        'ip_fingerprint', isl.ip_fingerprint,
        'country', isl.country,
        'city', isl.city,
        'isp', isl.isp,
        'vpn_detected', COALESCE(isl.vpn_detected, false),
        'first_seen_at', isl.first_seen_at,
        'last_seen_at', isl.last_seen_at
    ) INTO v_security_info
    FROM ip_security_logs isl
    WHERE isl.guest_id = p_guest_id
    ORDER BY isl.last_seen_at DESC
    LIMIT 1;

    -- 3. Get posts by this guest
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'title', p.title,
            'content_preview', LEFT(p.content, 100),
            'created_at', p.created_at,
            'view_count', p.view_count,
            'hidden', COALESCE(p.hidden, false)
        ) ORDER BY p.created_at DESC
    ), '[]'::jsonb) INTO v_posts
    FROM posts p
    WHERE p.guest_id = p_guest_id
    LIMIT 50;

    -- 4. Get comments by this guest
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'content_preview', LEFT(c.content, 100),
            'post_id', c.post_id,
            'created_at', c.created_at
        ) ORDER BY c.created_at DESC
    ), '[]'::jsonb) INTO v_comments
    FROM comments c
    WHERE c.guest_id = p_guest_id
    LIMIT 50;

    -- 5. Detect patterns (spam behavior)
    WITH post_timing AS (
        SELECT 
            created_at,
            LAG(created_at) OVER (ORDER BY created_at) as prev_created_at
        FROM posts WHERE guest_id = p_guest_id
    ),
    rapid_posts AS (
        SELECT COUNT(*) as rapid_count
        FROM post_timing
        WHERE created_at - prev_created_at < interval '1 minute'
    ),
    duplicate_content AS (
        SELECT COUNT(*) - COUNT(DISTINCT LEFT(content, 200)) as duplicates
        FROM posts WHERE guest_id = p_guest_id
    )
    SELECT jsonb_build_object(
        'rapid_posting_count', (SELECT rapid_count FROM rapid_posts),
        'duplicate_content_count', (SELECT duplicates FROM duplicate_content),
        'total_posts', (SELECT COUNT(*) FROM posts WHERE guest_id = p_guest_id),
        'total_comments', (SELECT COUNT(*) FROM comments WHERE guest_id = p_guest_id),
        'avg_post_length', (SELECT AVG(LENGTH(content)) FROM posts WHERE guest_id = p_guest_id),
        'posts_hidden', (SELECT COUNT(*) FROM posts WHERE guest_id = p_guest_id AND hidden = true)
    ) INTO v_patterns;

    -- 6. Find other guests with same IP (potential sockpuppets)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'guest_id', g.id,
            'fingerprint', g.fingerprint,
            'post_count', g.post_count,
            'first_seen', g.first_seen_at
        )
    ), '[]'::jsonb) INTO v_ip_history
    FROM ip_security_logs isl
    JOIN guests g ON g.id = isl.guest_id
    WHERE isl.real_ip = (SELECT real_ip FROM ip_security_logs WHERE guest_id = p_guest_id LIMIT 1)
    AND isl.guest_id != p_guest_id
    LIMIT 10;

    -- 7. Build risk factors
    v_risk_factors := ARRAY[]::JSONB[];
    
    -- VPN detected
    IF (v_security_info->>'vpn_detected')::boolean THEN
        v_risk_factors := array_append(v_risk_factors, jsonb_build_object(
            'factor', 'VPN/Proxy Detected',
            'severity', 'medium',
            'points', 20
        ));
    END IF;
    
    -- Rapid posting
    IF (v_patterns->>'rapid_posting_count')::int > 3 THEN
        v_risk_factors := array_append(v_risk_factors, jsonb_build_object(
            'factor', 'Rapid Posting Detected',
            'severity', 'high',
            'points', 25,
            'detail', (v_patterns->>'rapid_posting_count') || ' posts within 1 minute intervals'
        ));
    END IF;
    
    -- Duplicate content
    IF (v_patterns->>'duplicate_content_count')::int > 2 THEN
        v_risk_factors := array_append(v_risk_factors, jsonb_build_object(
            'factor', 'Duplicate Content Detected',
            'severity', 'high',
            'points', 20,
            'detail', (v_patterns->>'duplicate_content_count') || ' duplicate posts'
        ));
    END IF;
    
    -- No email verified
    IF NOT (v_guest_info->>'email_verified')::boolean THEN
        v_risk_factors := array_append(v_risk_factors, jsonb_build_object(
            'factor', 'Email Not Verified',
            'severity', 'low',
            'points', 10
        ));
    END IF;
    
    -- Shared IP with other guests
    IF jsonb_array_length(v_ip_history) > 0 THEN
        v_risk_factors := array_append(v_risk_factors, jsonb_build_object(
            'factor', 'IP Shared With Other Guests',
            'severity', 'medium',
            'points', 15,
            'detail', jsonb_array_length(v_ip_history) || ' other guests from same IP'
        ));
    END IF;
    
    -- Hidden posts
    IF (v_patterns->>'posts_hidden')::int > 0 THEN
        v_risk_factors := array_append(v_risk_factors, jsonb_build_object(
            'factor', 'Has Hidden Posts',
            'severity', 'medium',
            'points', 15,
            'detail', (v_patterns->>'posts_hidden') || ' posts hidden by admin'
        ));
    END IF;

    -- Build final result
    v_result := jsonb_build_object(
        'investigation_timestamp', NOW(),
        'target', v_guest_info,
        'security', COALESCE(v_security_info, '{}'::jsonb),
        'activity', jsonb_build_object(
            'posts', v_posts,
            'comments', v_comments
        ),
        'patterns', v_patterns,
        'related_guests', v_ip_history,
        'risk_factors', to_jsonb(v_risk_factors),
        'calculated_risk_score', LEAST(100, 
            COALESCE((SELECT SUM((rf->>'points')::int) FROM unnest(v_risk_factors) as rf), 0)
        )
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_auto_investigate_anon TO authenticated;

-- =============================================
-- Risk Score Explanation Function
-- =============================================

CREATE OR REPLACE FUNCTION admin_explain_risk_score(p_guest_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_guest RECORD;
    v_security RECORD;
    v_factors JSONB[] := ARRAY[]::JSONB[];
    v_positive JSONB[] := ARRAY[]::JSONB[];
    v_score INT := 50; -- Base score
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Get guest
    SELECT * INTO v_guest FROM guests WHERE id = p_guest_id;
    IF v_guest IS NULL THEN
        RETURN jsonb_build_object('error', 'Guest not found');
    END IF;

    -- Get security data
    SELECT * INTO v_security FROM ip_security_logs WHERE guest_id = p_guest_id LIMIT 1;

    -- === RISK FACTORS (increase score) ===
    
    -- VPN/Proxy
    IF v_security.vpn_detected THEN
        v_score := v_score + 20;
        v_factors := array_append(v_factors, jsonb_build_object(
            'factor', 'VPN/Proxy Detected',
            'impact', '+20',
            'reason', 'Anonymous network usage detected'
        ));
    END IF;

    -- No email
    IF v_guest.email IS NULL THEN
        v_score := v_score + 15;
        v_factors := array_append(v_factors, jsonb_build_object(
            'factor', 'No Email Provided',
            'impact', '+15',
            'reason', 'No contact/verification method'
        ));
    ELSIF NOT v_guest.email_verified THEN
        v_score := v_score + 10;
        v_factors := array_append(v_factors, jsonb_build_object(
            'factor', 'Email Not Verified',
            'impact', '+10',
            'reason', 'Email provided but unverified'
        ));
    END IF;

    -- High post rate (spam indicator)
    IF v_guest.post_count > 10 AND v_guest.first_seen_at > NOW() - INTERVAL '1 day' THEN
        v_score := v_score + 25;
        v_factors := array_append(v_factors, jsonb_build_object(
            'factor', 'High Post Rate',
            'impact', '+25',
            'reason', v_guest.post_count || ' posts in less than 24 hours'
        ));
    END IF;

    -- Previously blocked
    IF v_guest.blocked_at IS NOT NULL THEN
        v_score := v_score + 30;
        v_factors := array_append(v_factors, jsonb_build_object(
            'factor', 'Previously Blocked',
            'impact', '+30',
            'reason', 'Was blocked on ' || v_guest.blocked_at::date
        ));
    END IF;

    -- === TRUST FACTORS (decrease score) ===

    -- Email verified
    IF v_guest.email_verified THEN
        v_score := v_score - 20;
        v_positive := array_append(v_positive, jsonb_build_object(
            'factor', 'Email Verified',
            'impact', '-20',
            'reason', 'Verified contact method'
        ));
    END IF;

    -- Long-term user
    IF v_guest.first_seen_at < NOW() - INTERVAL '30 days' THEN
        v_score := v_score - 15;
        v_positive := array_append(v_positive, jsonb_build_object(
            'factor', 'Long-term Visitor',
            'impact', '-15',
            'reason', 'First seen ' || AGE(NOW(), v_guest.first_seen_at)
        ));
    END IF;

    -- Consistent behavior (no flags)
    IF v_guest.flags IS NULL OR jsonb_array_length(v_guest.flags) = 0 THEN
        v_score := v_score - 10;
        v_positive := array_append(v_positive, jsonb_build_object(
            'factor', 'No Flags',
            'impact', '-10',
            'reason', 'No behavior flags recorded'
        ));
    END IF;

    -- Clamp score
    v_score := GREATEST(0, LEAST(100, v_score));

    RETURN jsonb_build_object(
        'guest_id', p_guest_id,
        'current_score', v_score,
        'base_score', 50,
        'risk_factors', to_jsonb(v_factors),
        'trust_factors', to_jsonb(v_positive),
        'recommendation', CASE
            WHEN v_score >= 80 THEN 'HIGH RISK - Consider blocking'
            WHEN v_score >= 60 THEN 'ELEVATED - Monitor closely'
            WHEN v_score >= 40 THEN 'MODERATE - Standard monitoring'
            ELSE 'LOW RISK - Trusted visitor'
        END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_explain_risk_score TO authenticated;

-- =============================================
-- AI Moderation Suggestions
-- =============================================

CREATE OR REPLACE FUNCTION admin_suggest_action(p_guest_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_risk JSONB;
    v_score INT;
    v_suggestions JSONB[] := ARRAY[]::JSONB[];
    v_guest RECORD;
BEGIN
    -- Verify admin
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Get risk score
    v_risk := admin_explain_risk_score(p_guest_id);
    v_score := (v_risk->>'current_score')::int;
    
    -- Get guest
    SELECT * INTO v_guest FROM guests WHERE id = p_guest_id;

    -- Generate suggestions based on score
    IF v_score < 30 THEN
        v_suggestions := array_append(v_suggestions, jsonb_build_object(
            'action', 'NO ACTION NEEDED',
            'reason', 'Low risk visitor with good behavior',
            'command', NULL
        ));
    END IF;

    IF v_score >= 30 AND v_score < 50 THEN
        v_suggestions := array_append(v_suggestions, jsonb_build_object(
            'action', 'WATCH',
            'reason', 'Monitor activity without restriction',
            'command', 'sudo action --watch --confirm'
        ));
    END IF;

    IF v_score >= 50 AND v_score < 70 THEN
        v_suggestions := array_append(v_suggestions, jsonb_build_object(
            'action', 'RATE LIMIT',
            'reason', 'Slow down posting frequency',
            'command', 'sudo action --restrict --confirm'
        ));
        
        IF v_guest.email IS NULL THEN
            v_suggestions := array_append(v_suggestions, jsonb_build_object(
                'action', 'REQUIRE EMAIL',
                'reason', 'No verified identity',
                'command', 'sudo action --require-email --confirm'
            ));
        END IF;
    END IF;

    IF v_score >= 70 AND v_score < 90 THEN
        v_suggestions := array_append(v_suggestions, jsonb_build_object(
            'action', 'SHADOW RESTRICT',
            'reason', 'High risk - limit visibility silently',
            'command', 'sudo action --shadow-restrict --confirm'
        ));
    END IF;

    IF v_score >= 90 THEN
        v_suggestions := array_append(v_suggestions, jsonb_build_object(
            'action', 'TEMPORARY BLOCK',
            'reason', 'Very high risk - block for 24h',
            'command', 'sudo action --ban --duration=24h --confirm'
        ));
        v_suggestions := array_append(v_suggestions, jsonb_build_object(
            'action', 'PERMANENT BAN',
            'reason', 'Critical risk - permanent block',
            'command', 'sudo action --ban --confirm'
        ));
    END IF;

    -- Check for potential account merge
    IF EXISTS (
        SELECT 1 FROM ip_security_logs isl1
        JOIN ip_security_logs isl2 ON isl1.real_ip = isl2.real_ip
        WHERE isl1.guest_id = p_guest_id
        AND isl2.user_id IS NOT NULL
    ) THEN
        v_suggestions := array_append(v_suggestions, jsonb_build_object(
            'action', 'MERGE ACCOUNT',
            'reason', 'Same IP as registered user - possible alt account',
            'command', 'merge anon ' || p_guest_id::text || ' -> user @username'
        ));
    END IF;

    RETURN jsonb_build_object(
        'guest_id', p_guest_id,
        'risk_score', v_score,
        'suggestions', to_jsonb(v_suggestions),
        'disclaimer', 'Actions require --confirm flag. AI suggestions are advisory only.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_suggest_action TO authenticated;
