-- =====================================================
-- Abuse + Identity + Analytics tracking
-- Adds: geo-mismatch flag, first-touch attribution (referrer/UTM),
-- email intelligence (gravatar/MX/disposable), an analytics_events table,
-- and admin RPCs for related-identity correlation + analytics overview.
-- Fully additive & idempotent — safe on a live DB. Run in Supabase SQL Editor.
-- =====================================================

-- ============================================================================
-- 1. GUESTS + PROFILES: attribution + identity columns
-- ============================================================================
ALTER TABLE public.guests
    ADD COLUMN IF NOT EXISTS geo_mismatch BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS referrer TEXT,
    ADD COLUMN IF NOT EXISTS landing_page TEXT,
    ADD COLUMN IF NOT EXISTS utm JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS gravatar_hash TEXT,
    ADD COLUMN IF NOT EXISTS has_gravatar BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_mx_valid BOOLEAN,
    ADD COLUMN IF NOT EXISTS disposable_email_detected BOOLEAN DEFAULT FALSE;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS geo_mismatch BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS referrer TEXT,
    ADD COLUMN IF NOT EXISTS landing_page TEXT,
    ADD COLUMN IF NOT EXISTS utm JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS gravatar_hash TEXT,
    ADD COLUMN IF NOT EXISTS has_gravatar BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_mx_valid BOOLEAN,
    ADD COLUMN IF NOT EXISTS disposable_email_detected BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_guests_geo_mismatch ON public.guests(geo_mismatch) WHERE geo_mismatch = TRUE;
CREATE INDEX IF NOT EXISTS idx_guests_utm_source ON public.guests((utm->>'source'));
CREATE INDEX IF NOT EXISTS idx_profiles_geo_mismatch ON public.profiles(geo_mismatch) WHERE geo_mismatch = TRUE;

-- ============================================================================
-- 2. ANALYTICS EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT,
    guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL DEFAULT 'page_view', -- page_view | page_leave | session_start | custom
    path TEXT,
    title TEXT,
    referrer TEXT,
    meta JSONB DEFAULT '{}'::jsonb,               -- dwell_ms, scroll_depth, utm, viewport, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON public.analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_guest ON public.analytics_events(guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_user ON public.analytics_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_path ON public.analytics_events(path);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON public.analytics_events(event_type);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone (guest or user) may insert their own events; nobody can read except admins.
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
CREATE POLICY "Anyone can insert analytics events"
    ON public.analytics_events FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read analytics events" ON public.analytics_events;
CREATE POLICY "Admins can read analytics events"
    ON public.analytics_events FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 3. RPC: related identities (admin-only sock-puppet correlation)
--    Finds guests + users that share a fingerprint or IP hash.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_related_identities(
    p_fingerprint TEXT DEFAULT NULL,
    p_fingerprint_legacy TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_exclude_guest_id UUID DEFAULT NULL
)
RETURNS TABLE (
    kind TEXT,
    id UUID,
    label TEXT,
    status TEXT,
    post_count INTEGER,
    matched_on TEXT,
    last_seen TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;

    RETURN QUERY
    -- Matching guests
    SELECT
        'guest'::TEXT AS kind,
        g.id,
        COALESCE(NULLIF(g.email, ''), 'guest:' || LEFT(g.fingerprint, 8)) AS label,
        g.status,
        g.post_count,
        CASE
            WHEN p_fingerprint IS NOT NULL AND (g.fingerprint = p_fingerprint OR g.fingerprint_legacy = p_fingerprint) THEN 'fingerprint'
            WHEN p_fingerprint_legacy IS NOT NULL AND (g.fingerprint = p_fingerprint_legacy OR g.fingerprint_legacy = p_fingerprint_legacy) THEN 'fingerprint'
            ELSE 'ip'
        END AS matched_on,
        g.last_seen_at AS last_seen
    FROM public.guests g
    WHERE (p_exclude_guest_id IS NULL OR g.id <> p_exclude_guest_id)
      AND (
          (p_fingerprint IS NOT NULL AND (g.fingerprint = p_fingerprint OR g.fingerprint_legacy = p_fingerprint))
          OR (p_fingerprint_legacy IS NOT NULL AND (g.fingerprint = p_fingerprint_legacy OR g.fingerprint_legacy = p_fingerprint_legacy))
          OR (p_ip_hash IS NOT NULL AND g.ip_hash = p_ip_hash)
      )

    UNION ALL

    -- Matching registered users (share the same IP hash)
    SELECT
        'user'::TEXT AS kind,
        pr.id,
        COALESCE(NULLIF(pr.username, ''), 'user') AS label,
        COALESCE(pr.role, 'user') AS status,
        0 AS post_count,
        'ip'::TEXT AS matched_on,
        pr.last_ip_update AS last_seen
    FROM public.profiles pr
    WHERE p_ip_hash IS NOT NULL AND pr.ip_hash = p_ip_hash
    ORDER BY last_seen DESC NULLS LAST
    LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_related_identities TO authenticated;

-- ============================================================================
-- 4. RPC: analytics overview (admin-only aggregates for the dashboard)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_analytics_overview(p_days INTEGER DEFAULT 7)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_since TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
    v_result JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;

    SELECT jsonb_build_object(
        'total_events', (SELECT COUNT(*) FROM public.analytics_events WHERE created_at >= v_since),
        'page_views', (SELECT COUNT(*) FROM public.analytics_events WHERE created_at >= v_since AND event_type = 'page_view'),
        'unique_sessions', (SELECT COUNT(DISTINCT session_id) FROM public.analytics_events WHERE created_at >= v_since),
        'unique_guests', (SELECT COUNT(DISTINCT guest_id) FROM public.analytics_events WHERE created_at >= v_since AND guest_id IS NOT NULL),
        'avg_dwell_ms', (SELECT COALESCE(ROUND(AVG((meta->>'dwell_ms')::NUMERIC)), 0) FROM public.analytics_events WHERE created_at >= v_since AND meta ? 'dwell_ms'),
        'top_pages', (
            SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
                SELECT path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
                FROM public.analytics_events
                WHERE created_at >= v_since AND event_type = 'page_view' AND path IS NOT NULL
                GROUP BY path ORDER BY views DESC LIMIT 15
            ) t
        ),
        'top_referrers', (
            SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
                SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, COUNT(DISTINCT session_id) AS sessions
                FROM public.analytics_events
                WHERE created_at >= v_since AND event_type = 'page_view'
                GROUP BY 1 ORDER BY sessions DESC LIMIT 10
            ) t
        ),
        'daily', (
            SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) FROM (
                SELECT DATE_TRUNC('day', created_at)::DATE AS day,
                       COUNT(*) FILTER (WHERE event_type = 'page_view') AS views,
                       COUNT(DISTINCT session_id) AS sessions
                FROM public.analytics_events
                WHERE created_at >= v_since
                GROUP BY 1
            ) t
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_overview TO authenticated;

-- ============================================================================
-- 5. Docs
-- ============================================================================
COMMENT ON TABLE public.analytics_events IS 'First-party page-view / engagement events. Insert-only for visitors, admin-read.';
COMMENT ON COLUMN public.guests.geo_mismatch IS 'Browser timezone disagrees with IP-country timezone — VPN/proxy signal.';
COMMENT ON COLUMN public.guests.utm IS 'First-touch UTM params: {source, medium, campaign, term, content}.';
COMMENT ON COLUMN public.guests.gravatar_hash IS 'SHA-256 of the lowercased email, for Gravatar avatar/profile lookup.';

DO $$
BEGIN
    RAISE NOTICE '✅ Abuse + identity + analytics schema installed.';
END $$;
