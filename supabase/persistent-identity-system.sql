-- ============================================================================
-- PERSISTENT ANONYMOUS IDENTITY SYSTEM
-- Master Migration File - Run in Supabase SQL Editor
-- 
-- Author: Sin City Backend
-- Date: 2026-01-02
-- 
-- This file combines all migrations for the Persistent Anonymous Identity System.
-- Run this ONCE to set up the complete system.
-- ============================================================================

-- ============================================================================
-- PHASE 1: ACTIVITY LOGS TABLE
-- ============================================================================

-- Creating activity_logs table...

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'anon')),
    actor_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN (
        'visit', 'page_view', 'post_create', 'post_view', 'post_edit', 'post_delete',
        'comment_create', 'comment_edit', 'comment_delete', 'like', 'unlike',
        'dm_send', 'dm_read', 'follow', 'unfollow', 'login', 'logout',
        'register', 'merge', 'identity_resolve', 'admin_trace', 'admin_ip_lookup'
    )),
    target_type TEXT CHECK (target_type IN ('post', 'comment', 'profile', 'page', 'message', 'anon', NULL)),
    target_id UUID,
    target_metadata JSONB,
    ip_address TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    device_info JSONB,
    geo_info JSONB,
    session_id TEXT,
    referrer TEXT,
    page_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_actor ON public.activity_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON public.activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_target ON public.activity_logs(target_type, target_id) WHERE target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_ip_hash ON public.activity_logs(ip_hash) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_ip_address ON public.activity_logs(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_actor_timeline ON public.activity_logs(actor_type, actor_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "System can insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "No updates allowed" ON public.activity_logs;
DROP POLICY IF EXISTS "No deletes allowed" ON public.activity_logs;

CREATE POLICY "Admins can view activity logs" ON public.activity_logs FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "System can insert activity logs" ON public.activity_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "No updates allowed" ON public.activity_logs FOR UPDATE USING (false);
CREATE POLICY "No deletes allowed" ON public.activity_logs FOR DELETE USING (false);

-- Log activity function
CREATE OR REPLACE FUNCTION log_activity(
    p_actor_type TEXT, p_actor_id UUID, p_action TEXT,
    p_target_type TEXT DEFAULT NULL, p_target_id UUID DEFAULT NULL, p_target_metadata JSONB DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL, p_ip_hash TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT NULL, p_geo_info JSONB DEFAULT NULL, p_session_id TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL, p_page_url TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_log_id UUID;
BEGIN
    INSERT INTO public.activity_logs (
        actor_type, actor_id, action, target_type, target_id, target_metadata,
        ip_address, ip_hash, user_agent, device_info, geo_info, session_id, referrer, page_url
    ) VALUES (
        p_actor_type, p_actor_id, p_action, p_target_type, p_target_id, p_target_metadata,
        p_ip_address, p_ip_hash, p_user_agent, p_device_info, p_geo_info, p_session_id, p_referrer, p_page_url
    ) RETURNING id INTO v_log_id;
    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_activity TO anon, authenticated;

-- Activity logs table created!

-- ============================================================================
-- PHASE 2: ENHANCE GUESTS TABLE
-- ============================================================================

-- Enhancing guests table...

-- Add new columns
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS anon_token TEXT UNIQUE;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS merged_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS ip_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS soft_linked_from UUID[] DEFAULT '{}';
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS soft_link_trust_score INTEGER DEFAULT 0 
    CHECK (soft_link_trust_score >= 0 AND soft_link_trust_score <= 100);

-- Generate tokens for existing guests
UPDATE public.guests SET anon_token = encode(gen_random_bytes(32), 'hex') WHERE anon_token IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guests_anon_token ON public.guests(anon_token) WHERE anon_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_merged_user ON public.guests(merged_user_id) WHERE merged_user_id IS NOT NULL;

-- Update status constraint
ALTER TABLE public.guests DROP CONSTRAINT IF EXISTS guests_status_check;
ALTER TABLE public.guests ADD CONSTRAINT guests_status_check CHECK (status IN ('active', 'blocked', 'restricted', 'merged'));

-- Token generation trigger
CREATE OR REPLACE FUNCTION generate_anon_token() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.anon_token IS NULL THEN NEW.anon_token := encode(gen_random_bytes(32), 'hex'); END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_anon_token ON public.guests;
CREATE TRIGGER trigger_generate_anon_token BEFORE INSERT ON public.guests FOR EACH ROW EXECUTE FUNCTION generate_anon_token();

-- Guests table enhanced!

-- ============================================================================
-- PHASE 3: IP HISTORY & SOFT-LINK FUNCTIONS
-- ============================================================================

-- Creating identity resolution functions...

-- Update IP history
CREATE OR REPLACE FUNCTION update_guest_ip_history(
    p_guest_id UUID, p_ip_address TEXT, p_ip_hash TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL, p_isp TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_new_entry JSONB;
    v_existing_history JSONB;
BEGIN
    v_new_entry := jsonb_build_object('ip', p_ip_address, 'ip_hash', p_ip_hash, 'country', p_country, 'city', p_city, 'isp', p_isp, 'seen_at', NOW());
    SELECT COALESCE(ip_history, '[]'::jsonb) INTO v_existing_history FROM public.guests WHERE id = p_guest_id;
    
    IF v_existing_history->0->>'ip' = p_ip_address THEN
        v_existing_history := jsonb_set(v_existing_history, '{0,seen_at}', to_jsonb(NOW()::text));
    ELSE
        v_existing_history := jsonb_build_array(v_new_entry) || (SELECT jsonb_agg(elem) FROM (SELECT elem FROM jsonb_array_elements(v_existing_history) AS elem LIMIT 49) sub);
    END IF;
    
    UPDATE public.guests SET ip_history = v_existing_history, last_seen_at = NOW() WHERE id = p_guest_id;
END;
$$;

-- Find soft-linked guest
CREATE OR REPLACE FUNCTION find_soft_linked_guest(p_fingerprint TEXT, p_ip_address TEXT DEFAULT NULL, p_ip_hash TEXT DEFAULT NULL)
RETURNS TABLE (guest_id UUID, match_type TEXT, confidence INTEGER) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT g.id, 'fingerprint'::TEXT, 100 FROM public.guests g 
    WHERE g.fingerprint = p_fingerprint AND g.status != 'merged' AND g.merged_user_id IS NULL
    UNION ALL
    SELECT g.id, 'ip_hash'::TEXT, 70 FROM public.guests g 
    WHERE g.ip_hash = p_ip_hash AND p_ip_hash IS NOT NULL AND g.status != 'merged' AND g.merged_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.guests g2 WHERE g2.fingerprint = p_fingerprint)
    UNION ALL
    SELECT g.id, 'ip_history'::TEXT, 50 FROM public.guests g 
    WHERE p_ip_address IS NOT NULL AND g.ip_history @> jsonb_build_array(jsonb_build_object('ip', p_ip_address))
    AND g.status != 'merged' AND g.merged_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.guests g2 WHERE g2.fingerprint = p_fingerprint)
    AND NOT EXISTS (SELECT 1 FROM public.guests g2 WHERE g2.ip_hash = p_ip_hash)
    ORDER BY confidence DESC LIMIT 1;
END;
$$;

-- Main identity resolution function
CREATE OR REPLACE FUNCTION resolve_anon_identity(
    p_anon_token TEXT DEFAULT NULL, p_fingerprint TEXT DEFAULT NULL, p_session_id TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb, p_ip_address TEXT DEFAULT NULL, p_ip_hash TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL, p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE, p_tor_detected BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_guest RECORD; v_soft_link RECORD; v_new_guest_id UUID; v_result JSONB;
BEGIN
    -- Try token match
    IF p_anon_token IS NOT NULL AND p_anon_token != '' THEN
        SELECT * INTO v_guest FROM public.guests WHERE anon_token = p_anon_token AND status != 'merged' AND merged_user_id IS NULL;
        IF FOUND THEN
            PERFORM update_guest_ip_history(v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp);
            UPDATE public.guests SET session_id = COALESCE(p_session_id, session_id), device_info = COALESCE(p_device_info, device_info),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected), tor_detected = COALESCE(p_tor_detected, tor_detected), last_seen_at = NOW()
            WHERE id = v_guest.id;
            RETURN jsonb_build_object('success', true, 'guest_id', v_guest.id, 'anon_id', v_guest.anonymous_id, 'anon_token', v_guest.anon_token,
                'status', v_guest.status, 'trust_score', v_guest.trust_score, 'is_new', false, 'match_type', 'token');
        END IF;
    END IF;

    -- Try fingerprint match
    IF p_fingerprint IS NOT NULL AND p_fingerprint != '' THEN
        SELECT * INTO v_guest FROM public.guests WHERE fingerprint = p_fingerprint AND status != 'merged' AND merged_user_id IS NULL;
        IF FOUND THEN
            PERFORM update_guest_ip_history(v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp);
            UPDATE public.guests SET session_id = COALESCE(p_session_id, session_id), device_info = COALESCE(p_device_info, device_info),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected), tor_detected = COALESCE(p_tor_detected, tor_detected), last_seen_at = NOW()
            WHERE id = v_guest.id;
            RETURN jsonb_build_object('success', true, 'guest_id', v_guest.id, 'anon_id', v_guest.anonymous_id, 'anon_token', v_guest.anon_token,
                'status', v_guest.status, 'trust_score', v_guest.trust_score, 'is_new', false, 'match_type', 'fingerprint');
        END IF;
    END IF;

    -- Try soft-link
    SELECT * INTO v_soft_link FROM find_soft_linked_guest(p_fingerprint, p_ip_address, p_ip_hash);
    IF FOUND AND v_soft_link.confidence >= 70 THEN
        SELECT * INTO v_guest FROM public.guests WHERE id = v_soft_link.guest_id;
        IF FOUND THEN
            UPDATE public.guests SET soft_linked_from = array_append(COALESCE(soft_linked_from, '{}'), v_guest.id),
                soft_link_trust_score = v_soft_link.confidence, fingerprint = COALESCE(p_fingerprint, fingerprint),
                session_id = COALESCE(p_session_id, session_id), last_seen_at = NOW()
            WHERE id = v_guest.id;
            PERFORM update_guest_ip_history(v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp);
            RETURN jsonb_build_object('success', true, 'guest_id', v_guest.id, 'anon_id', v_guest.anonymous_id, 'anon_token', v_guest.anon_token,
                'status', v_guest.status, 'trust_score', v_guest.trust_score, 'is_new', false, 'match_type', 'soft_link', 'soft_link_confidence', v_soft_link.confidence);
        END IF;
    END IF;

    -- Create new guest
    INSERT INTO public.guests (fingerprint, session_id, device_info, ip_hash, country, city, isp, vpn_detected, tor_detected, flags, ip_history)
    VALUES (
        COALESCE(p_fingerprint, 'unknown-' || encode(gen_random_bytes(16), 'hex')), p_session_id, p_device_info, p_ip_hash,
        p_country, p_city, p_isp, COALESCE(p_vpn_detected, false), COALESCE(p_tor_detected, false), ARRAY['new'],
        CASE WHEN p_ip_address IS NOT NULL THEN jsonb_build_array(jsonb_build_object('ip', p_ip_address, 'ip_hash', p_ip_hash, 'country', p_country, 'city', p_city, 'isp', p_isp, 'seen_at', NOW())) ELSE '[]'::jsonb END
    ) RETURNING id INTO v_new_guest_id;

    SELECT * INTO v_guest FROM public.guests WHERE id = v_new_guest_id;
    PERFORM log_activity('anon', v_new_guest_id, 'identity_resolve', NULL, NULL, jsonb_build_object('is_new', true));

    RETURN jsonb_build_object('success', true, 'guest_id', v_guest.id, 'anon_id', v_guest.anonymous_id, 'anon_token', v_guest.anon_token,
        'status', v_guest.status, 'trust_score', v_guest.trust_score, 'is_new', true, 'match_type', 'created');
END;
$$;

GRANT EXECUTE ON FUNCTION update_guest_ip_history TO anon, authenticated;
GRANT EXECUTE ON FUNCTION find_soft_linked_guest TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_anon_identity TO anon, authenticated;

-- Identity resolution functions created!

-- ============================================================================
-- PHASE 4: AUTHOR ENFORCEMENT
-- ============================================================================

-- Enforcing author identity on content...

-- Author type column
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_type TEXT DEFAULT 'user';
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_author_type_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_author_type_check CHECK (author_type IN ('user', 'guest', 'anon'));

-- Create system guest for orphans
DO $$
DECLARE v_system_guest_id UUID;
BEGIN
    SELECT id INTO v_system_guest_id FROM public.guests WHERE fingerprint = 'SYSTEM_ORPHAN_GUEST';
    IF v_system_guest_id IS NULL THEN
        INSERT INTO public.guests (fingerprint, session_id, status, trust_score, flags)
        VALUES ('SYSTEM_ORPHAN_GUEST', 'system', 'active', 100, ARRAY['system'])
        RETURNING id INTO v_system_guest_id;
    END IF;
    UPDATE public.posts SET guest_id = v_system_guest_id, author_type = 'guest' WHERE user_id IS NULL AND guest_id IS NULL;
    UPDATE public.comments SET guest_id = v_system_guest_id WHERE user_id IS NULL AND guest_id IS NULL;
END $$;

-- Author constraints
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_require_author;
ALTER TABLE public.posts ADD CONSTRAINT posts_require_author CHECK ((user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL));

ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_require_author;
ALTER TABLE public.comments ADD CONSTRAINT comments_require_author CHECK ((user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL));

-- Auto-set author type trigger
CREATE OR REPLACE FUNCTION set_author_type() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN NEW.author_type := 'user';
    ELSIF NEW.guest_id IS NOT NULL THEN NEW.author_type := 'anon';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_post_author_type ON public.posts;
CREATE TRIGGER trigger_set_post_author_type BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION set_author_type();

-- Validate author function
CREATE OR REPLACE FUNCTION validate_content_author(p_user_id UUID DEFAULT NULL, p_guest_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_valid BOOLEAN := FALSE; v_guest_valid BOOLEAN := FALSE;
BEGIN
    IF (p_user_id IS NULL AND p_guest_id IS NULL) THEN RETURN jsonb_build_object('valid', false, 'error', 'No identity provided'); END IF;
    IF (p_user_id IS NOT NULL AND p_guest_id IS NOT NULL) THEN RETURN jsonb_build_object('valid', false, 'error', 'Both identities provided'); END IF;
    
    IF p_user_id IS NOT NULL THEN
        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = p_user_id) INTO v_user_valid;
        IF NOT v_user_valid THEN RETURN jsonb_build_object('valid', false, 'error', 'Invalid user_id'); END IF;
        RETURN jsonb_build_object('valid', true, 'author_type', 'user', 'author_id', p_user_id);
    END IF;
    
    IF p_guest_id IS NOT NULL THEN
        SELECT EXISTS(SELECT 1 FROM public.guests WHERE id = p_guest_id AND status NOT IN ('blocked', 'merged')) INTO v_guest_valid;
        IF NOT v_guest_valid THEN RETURN jsonb_build_object('valid', false, 'error', 'Invalid guest_id'); END IF;
        RETURN jsonb_build_object('valid', true, 'author_type', 'anon', 'author_id', p_guest_id);
    END IF;
    
    RETURN jsonb_build_object('valid', false, 'error', 'Unknown error');
END;
$$;

GRANT EXECUTE ON FUNCTION validate_content_author TO anon, authenticated;

-- Update existing posts
UPDATE public.posts SET author_type = 'user' WHERE user_id IS NOT NULL AND (author_type IS NULL OR author_type != 'user');
UPDATE public.posts SET author_type = 'anon' WHERE guest_id IS NOT NULL AND (author_type IS NULL OR author_type NOT IN ('guest', 'anon'));

-- Author enforcement complete!

-- ============================================================================
-- PHASE 5: MERGE SYSTEM
-- ============================================================================

-- Creating merge system...

-- Main merge function
CREATE OR REPLACE FUNCTION merge_anon_to_user(p_anon_id UUID, p_user_id UUID, p_admin_initiated BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_anon RECORD; v_user RECORD; v_admin_id UUID;
    v_posts_merged INT := 0; v_comments_merged INT := 0; v_likes_merged INT := 0; v_dms_merged INT := 0; v_activity_merged INT := 0;
BEGIN
    SELECT * INTO v_anon FROM public.guests WHERE id = p_anon_id;
    IF v_anon IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Anonymous user not found'); END IF;
    IF v_anon.merged_user_id IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Already merged'); END IF;
    
    SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
    
    IF p_admin_initiated THEN
        v_admin_id := auth.uid();
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_admin_id AND role = 'admin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Admin required');
        END IF;
    END IF;
    
    UPDATE public.posts SET user_id = p_user_id, guest_id = NULL, author_type = 'user' WHERE guest_id = p_anon_id;
    GET DIAGNOSTICS v_posts_merged = ROW_COUNT;
    
    UPDATE public.comments SET user_id = p_user_id, guest_id = NULL WHERE guest_id = p_anon_id;
    GET DIAGNOSTICS v_comments_merged = ROW_COUNT;
    
    BEGIN UPDATE public.likes SET user_id = p_user_id WHERE guest_id = p_anon_id; GET DIAGNOSTICS v_likes_merged = ROW_COUNT;
    EXCEPTION WHEN undefined_table THEN v_likes_merged := 0; END;
    
    UPDATE public.activity_logs SET actor_id = p_user_id, actor_type = 'user' WHERE actor_type = 'anon' AND actor_id = p_anon_id;
    GET DIAGNOSTICS v_activity_merged = ROW_COUNT;
    
    UPDATE public.guests SET merged_user_id = p_user_id, merged_at = NOW(), status = 'merged' WHERE id = p_anon_id;
    
    INSERT INTO public.activity_logs (actor_type, actor_id, action, target_type, target_id, target_metadata)
    VALUES ('user', p_user_id, 'merge', 'anon', p_anon_id, jsonb_build_object(
        'posts_merged', v_posts_merged, 'comments_merged', v_comments_merged, 'merged_at', NOW()));
    
    RETURN jsonb_build_object('success', true, 'anon_id', p_anon_id, 'user_id', p_user_id, 'username', v_user.username,
        'posts_merged', v_posts_merged, 'comments_merged', v_comments_merged, 'total_merged', v_posts_merged + v_comments_merged);
END;
$$;

-- Auto-merge on registration
CREATE OR REPLACE FUNCTION auto_merge_on_registration(p_user_id UUID, p_anon_token TEXT DEFAULT NULL, p_fingerprint TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_anon_id UUID;
BEGIN
    IF p_anon_token IS NOT NULL THEN
        SELECT id INTO v_anon_id FROM public.guests WHERE anon_token = p_anon_token AND merged_user_id IS NULL AND status != 'merged';
    END IF;
    IF v_anon_id IS NULL AND p_fingerprint IS NOT NULL THEN
        SELECT id INTO v_anon_id FROM public.guests WHERE fingerprint = p_fingerprint AND merged_user_id IS NULL AND status != 'merged';
    END IF;
    IF v_anon_id IS NOT NULL THEN RETURN merge_anon_to_user(v_anon_id, p_user_id, FALSE); END IF;
    RETURN jsonb_build_object('success', true, 'merged', false, 'message', 'No anon to merge');
END;
$$;

-- Admin merge command
CREATE OR REPLACE FUNCTION admin_merge_anon_to_user(p_anon_identifier TEXT, p_username TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_anon_id UUID; v_user_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Admin required');
    END IF;
    SELECT id INTO v_anon_id FROM public.guests WHERE id::TEXT = p_anon_identifier OR anonymous_id = p_anon_identifier OR fingerprint = p_anon_identifier LIMIT 1;
    IF v_anon_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Anon not found'); END IF;
    SELECT id INTO v_user_id FROM public.profiles WHERE username = p_username;
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
    RETURN merge_anon_to_user(v_anon_id, v_user_id, TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION merge_anon_to_user TO authenticated;
GRANT EXECUTE ON FUNCTION auto_merge_on_registration TO authenticated;
GRANT EXECUTE ON FUNCTION admin_merge_anon_to_user TO authenticated;

-- Merge system complete!

-- ============================================================================
-- PHASE 6: ADMIN TRACE COMMANDS
-- ============================================================================

-- Creating admin trace commands...

-- Full anon trace
CREATE OR REPLACE FUNCTION admin_trace_anon(p_anon_identifier TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_guest_id UUID; v_guest RECORD; v_result JSONB;
    v_posts JSONB; v_comments JSONB; v_activity JSONB; v_security_logs JSONB; v_related JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Admin required';
    END IF;

    SELECT id INTO v_guest_id FROM public.guests 
    WHERE id::TEXT = p_anon_identifier OR anonymous_id = p_anon_identifier OR fingerprint = p_anon_identifier OR anon_token = p_anon_identifier LIMIT 1;
    IF v_guest_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not found'); END IF;

    SELECT * INTO v_guest FROM public.guests WHERE id = v_guest_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'created_at', p.created_at, 'hidden', p.hidden) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO v_posts FROM public.posts p WHERE p.guest_id = v_guest_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'content', LEFT(c.content, 100), 'created_at', c.created_at) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_comments FROM public.comments c WHERE c.guest_id = v_guest_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('action', al.action, 'created_at', al.created_at, 'ip', al.ip_address) ORDER BY al.created_at DESC), '[]'::jsonb)
    INTO v_activity FROM public.activity_logs al WHERE al.actor_type = 'anon' AND al.actor_id = v_guest_id LIMIT 100;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('real_ip', isl.real_ip, 'country', isl.country, 'vpn', isl.vpn_detected, 'last_seen', isl.last_seen_at) ORDER BY isl.last_seen_at DESC), '[]'::jsonb)
    INTO v_security_logs FROM public.ip_security_logs isl WHERE isl.guest_id = v_guest_id;

    INSERT INTO public.activity_logs (actor_type, actor_id, action, target_type, target_id) VALUES ('user', auth.uid(), 'admin_trace', 'anon', v_guest_id);

    RETURN jsonb_build_object(
        'success', true, 'trace_timestamp', NOW(),
        'target', jsonb_build_object('guest_id', v_guest.id, 'anonymous_id', v_guest.anonymous_id, 'fingerprint', v_guest.fingerprint,
            'status', v_guest.status, 'trust_score', v_guest.trust_score, 'post_count', v_guest.post_count, 'first_seen', v_guest.first_seen_at, 'last_seen', v_guest.last_seen_at),
        'network', jsonb_build_object('ip_history', v_guest.ip_history, 'security_logs', v_security_logs, 'country', v_guest.country, 'vpn', v_guest.vpn_detected),
        'content', jsonb_build_object('posts', v_posts, 'comments', v_comments),
        'activity', v_activity,
        'merge_info', CASE WHEN v_guest.merged_user_id IS NOT NULL THEN jsonb_build_object('merged_to', v_guest.merged_user_id, 'merged_at', v_guest.merged_at) ELSE NULL END
    );
END;
$$;

-- Timeline replay
CREATE OR REPLACE FUNCTION admin_timeline_replay(p_entity_type TEXT, p_entity_identifier TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_entity_id UUID; v_events JSONB; v_actor_type TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;

    IF p_entity_type = 'anon' THEN
        v_actor_type := 'anon';
        SELECT id INTO v_entity_id FROM public.guests WHERE id::TEXT = p_entity_identifier OR anonymous_id = p_entity_identifier;
    ELSIF p_entity_type = 'user' THEN
        v_actor_type := 'user';
        SELECT id INTO v_entity_id FROM public.profiles WHERE id::TEXT = p_entity_identifier OR username = p_entity_identifier;
    ELSE
        RETURN jsonb_build_object('error', 'Invalid entity type');
    END IF;

    IF v_entity_id IS NULL THEN RETURN jsonb_build_object('error', 'Not found'); END IF;

    WITH all_events AS (
        SELECT al.created_at, al.action, al.action || COALESCE(': ' || al.target_type, '') as description, jsonb_build_object('target_id', al.target_id, 'ip', al.ip_address) as meta
        FROM public.activity_logs al WHERE al.actor_type = v_actor_type AND al.actor_id = v_entity_id
        UNION ALL
        SELECT p.created_at, 'post_create', 'Created: ' || LEFT(p.title, 40), jsonb_build_object('post_id', p.id)
        FROM public.posts p WHERE (v_actor_type = 'anon' AND p.guest_id = v_entity_id) OR (v_actor_type = 'user' AND p.user_id = v_entity_id)
        ORDER BY created_at DESC
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('timestamp', created_at, 'type', action, 'desc', description, 'meta', meta)), '[]'::jsonb)
    INTO v_events FROM all_events LIMIT 500;

    RETURN jsonb_build_object('entity_type', p_entity_type, 'entity_id', v_entity_id, 'event_count', jsonb_array_length(v_events), 'events', v_events);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_trace_anon TO authenticated;
GRANT EXECUTE ON FUNCTION admin_timeline_replay TO authenticated;

-- Admin commands complete!

-- ============================================================================
-- COMPLETE!
-- ============================================================================

SELECT 'Persistent Anonymous Identity System installed successfully!' AS status;
