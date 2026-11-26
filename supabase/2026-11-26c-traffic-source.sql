-- ============================================================================
-- Traffic source: where users / guests / sessions came from
-- Run once in the Supabase SQL Editor, AFTER 2026-11-26b-admin-only-network-data.sql.
-- Safe to re-run. Adds no columns — it only exposes what is already captured
-- (profiles.referrer / landing_page / utm, analytics_events.meta) to admins.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Traffic source of registered users — their latest visit (admin-only).
--    profiles.referrer / landing_page / utm are hidden from browsers, so the
--    admin panel reads them through this function.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_user_attribution(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    id           UUID,
    referrer     TEXT,
    landing_page TEXT,
    utm          JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role::text = 'admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT p.id, p.referrer::text, p.landing_page::text, COALESCE(p.utm, '{}'::jsonb)
      FROM public.profiles p
     WHERE p_user_id IS NULL OR p.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_attribution(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_attribution(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Analytics overview: adds top_sources and top_campaigns.
--    New events carry meta.source / meta.medium (classified in the browser).
--    Older events fall back to the referrer's host name, or "direct".
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_analytics_overview(p_days INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_since TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
    v_result JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role::text = 'admin') THEN
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
        'top_sources', (
            SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
                SELECT s.source,
                       MAX(s.medium) AS medium,
                       COUNT(DISTINCT s.session_id) AS sessions,
                       COUNT(*) AS views
                FROM (
                    SELECT session_id,
                           COALESCE(
                               NULLIF(meta->>'source', ''),
                               CASE WHEN COALESCE(referrer, '') = '' THEN 'direct'
                                    ELSE COALESCE(LOWER(substring(referrer from '^[A-Za-z][A-Za-z0-9+.-]*://(?:www\.)?([^/:?#]+)')), 'other')
                               END
                           ) AS source,
                           NULLIF(meta->>'medium', '') AS medium
                    FROM public.analytics_events
                    WHERE created_at >= v_since AND event_type = 'page_view'
                ) s
                GROUP BY s.source ORDER BY sessions DESC, views DESC LIMIT 15
            ) t
        ),
        'top_campaigns', (
            SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
                SELECT meta->'utm'->>'campaign' AS campaign,
                       COALESCE(NULLIF(meta->>'source', ''), NULLIF(meta->'utm'->>'source', ''), '-') AS source,
                       COUNT(DISTINCT session_id) AS sessions
                FROM public.analytics_events
                WHERE created_at >= v_since AND event_type = 'page_view'
                  AND COALESCE(meta->'utm'->>'campaign', '') <> ''
                GROUP BY 1, 2 ORDER BY sessions DESC LIMIT 10
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

GRANT EXECUTE ON FUNCTION public.get_analytics_overview(INTEGER) TO authenticated;

SELECT 'traffic source reporting installed' AS status;
