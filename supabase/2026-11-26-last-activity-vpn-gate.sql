-- ============================================================================
-- Last activity / last login in the admin panel, server-recorded IPs, VPN gate
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns (all IF NOT EXISTS — older setup scripts created different subsets)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS last_seen        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_seen_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_ip_update   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ip_hash          TEXT,
    ADD COLUMN IF NOT EXISTS ip_source        TEXT,
    ADD COLUMN IF NOT EXISTS country          TEXT,
    ADD COLUMN IF NOT EXISTS city             TEXT,
    ADD COLUMN IF NOT EXISTS isp              TEXT,
    ADD COLUMN IF NOT EXISTS vpn_detected     BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tor_detected     BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS proxy_detected   BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hosting_detected BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mobile_detected  BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS network_info     JSONB,
    ADD COLUMN IF NOT EXISTS geo_mismatch     BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS referrer         TEXT,
    ADD COLUMN IF NOT EXISTS landing_page     TEXT,
    ADD COLUMN IF NOT EXISTS utm              JSONB;

CREATE TABLE IF NOT EXISTS public.ip_security_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    guest_id      UUID,
    real_ip       TEXT,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ip_security_logs
    ADD COLUMN IF NOT EXISTS user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS real_ip       TEXT,
    ADD COLUMN IF NOT EXISTS ip_hash       TEXT,
    ADD COLUMN IF NOT EXISTS ip_source     TEXT,
    ADD COLUMN IF NOT EXISTS country       TEXT,
    ADD COLUMN IF NOT EXISTS city          TEXT,
    ADD COLUMN IF NOT EXISTS isp           TEXT,
    ADD COLUMN IF NOT EXISTS vpn_detected  BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS action        TEXT,
    ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ip_security_logs_user_last_seen
    ON public.ip_security_logs (user_id, last_seen_at DESC);

-- Real IPs are admin-only.
ALTER TABLE public.ip_security_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read ip security logs" ON public.ip_security_logs;
CREATE POLICY "Admins read ip security logs" ON public.ip_security_logs
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role::text = 'admin'));

-- ----------------------------------------------------------------------------
-- 2. record_user_visit — called ONLY by the server (/api/guest-init, service role)
--    with the IP it read from the request. Browsers cannot call it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_user_visit(
    p_user_id UUID,
    p_ip      TEXT,
    p_data    JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_user_id IS NULL THEN RETURN; END IF;

    -- Keys absent from p_data (e.g. the geo providers were unreachable) keep
    -- their previous value instead of being overwritten with "Unknown".
    UPDATE public.profiles p SET
        last_seen        = NOW(),
        last_seen_at     = NOW(),
        last_ip_update   = NOW(),
        ip_hash          = COALESCE(p_data->>'ip_hash', p.ip_hash),
        ip_source        = COALESCE(p_data->>'ip_source', p.ip_source),
        country          = COALESCE(p_data->>'country', p.country),
        city             = COALESCE(p_data->>'city', p.city),
        isp              = COALESCE(p_data->>'isp', p.isp),
        vpn_detected     = COALESCE((p_data->>'vpn_detected')::boolean, p.vpn_detected),
        tor_detected     = COALESCE((p_data->>'tor_detected')::boolean, p.tor_detected),
        proxy_detected   = COALESCE((p_data->>'proxy_detected')::boolean, p.proxy_detected),
        hosting_detected = COALESCE((p_data->>'hosting_detected')::boolean, p.hosting_detected),
        mobile_detected  = COALESCE((p_data->>'mobile_detected')::boolean, p.mobile_detected),
        geo_mismatch     = COALESCE((p_data->>'geo_mismatch')::boolean, p.geo_mismatch),
        network_info     = COALESCE(p_data->'network_info', p.network_info),
        referrer         = COALESCE(p_data->>'referrer', p.referrer),
        landing_page     = COALESCE(p_data->>'landing_page', p.landing_page),
        utm              = COALESCE(p_data->'utm', p.utm)
    WHERE p.id = p_user_id;

    -- One row per (user, IP): keeps a history of every address the user came from.
    IF p_ip IS NOT NULL AND p_ip <> '' THEN
        BEGIN
            UPDATE public.ip_security_logs l SET
                last_seen_at = NOW(),
                ip_hash      = COALESCE(p_data->>'ip_hash', l.ip_hash),
                ip_source    = COALESCE(p_data->>'ip_source', l.ip_source),
                country      = COALESCE(p_data->>'country', l.country),
                city         = COALESCE(p_data->>'city', l.city),
                isp          = COALESCE(p_data->>'isp', l.isp),
                vpn_detected = COALESCE((p_data->>'vpn_detected')::boolean, l.vpn_detected)
            WHERE l.user_id = p_user_id AND l.real_ip = p_ip;

            IF NOT FOUND THEN
                INSERT INTO public.ip_security_logs
                    (user_id, real_ip, ip_hash, ip_source, country, city, isp, vpn_detected, action, last_seen_at)
                VALUES
                    (p_user_id, p_ip, p_data->>'ip_hash', p_data->>'ip_source', p_data->>'country',
                     p_data->>'city', p_data->>'isp', COALESCE((p_data->>'vpn_detected')::boolean, FALSE),
                     'visit', NOW());
            END IF;
        EXCEPTION
            WHEN unique_violation THEN
                -- Older schema: a unique index allows a single row per user. Reuse it.
                UPDATE public.ip_security_logs l SET
                    real_ip      = p_ip,
                    last_seen_at = NOW(),
                    ip_hash      = COALESCE(p_data->>'ip_hash', l.ip_hash),
                    ip_source    = COALESCE(p_data->>'ip_source', l.ip_source),
                    country      = COALESCE(p_data->>'country', l.country),
                    city         = COALESCE(p_data->>'city', l.city),
                    isp          = COALESCE(p_data->>'isp', l.isp),
                    vpn_detected = COALESCE((p_data->>'vpn_detected')::boolean, l.vpn_detected)
                WHERE l.user_id = p_user_id;
            WHEN OTHERS THEN
                RAISE WARNING 'record_user_visit: ip log failed for %: %', p_user_id, SQLERRM;
        END;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_visit(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_visit(UUID, TEXT, JSONB) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. get_users_with_activity — admin user list with last activity, last login
--    and the most recent IP per user.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_users_with_activity();
CREATE FUNCTION public.get_users_with_activity()
RETURNS TABLE (
    id              UUID,
    username        TEXT,
    email           TEXT,
    role            TEXT,
    created_at      TIMESTAMPTZ,
    country         TEXT,
    city            TEXT,
    ip_hash         TEXT,
    isp             TEXT,
    vpn_detected    BOOLEAN,
    tor_detected    BOOLEAN,
    last_ip_update  TIMESTAMPTZ,
    last_seen       TIMESTAMPTZ,   -- last time the user had the site open
    last_sign_in_at TIMESTAMPTZ,   -- last time the user typed their password / signed in
    last_ip         TEXT,
    last_ip_seen_at TIMESTAMPTZ,
    ip_count        INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role::text = 'admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.username::text,
        au.email::text,
        p.role::text,
        p.created_at::timestamptz,
        p.country::text,
        p.city::text,
        p.ip_hash::text,
        p.isp::text,
        COALESCE(p.vpn_detected, FALSE),
        COALESCE(p.tor_detected, FALSE),
        p.last_ip_update::timestamptz,
        GREATEST(p.last_seen::timestamptz, p.last_seen_at::timestamptz, au.last_sign_in_at),
        au.last_sign_in_at,
        ip.real_ip::text,
        ip.last_seen_at::timestamptz,
        COALESCE(ipc.n, 0)::integer
    FROM public.profiles p
    JOIN auth.users au ON au.id = p.id
    LEFT JOIN LATERAL (
        SELECT l.real_ip, l.last_seen_at
        FROM public.ip_security_logs l
        WHERE l.user_id = p.id AND l.real_ip IS NOT NULL
        ORDER BY l.last_seen_at DESC NULLS LAST
        LIMIT 1
    ) ip ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT l2.real_ip) AS n
        FROM public.ip_security_logs l2
        WHERE l2.user_id = p.id AND l2.real_ip IS NOT NULL
    ) ipc ON TRUE
    ORDER BY p.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_users_with_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_users_with_activity() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Site setting: block VPN / proxy / Tor visitors (toggle in Admin > Settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_settings (
    id          TEXT PRIMARY KEY,
    value       JSONB,
    description TEXT,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.site_settings (id, value, description)
VALUES ('block_vpn', 'true'::jsonb, 'Require visitors to turn off VPN / proxy / Tor to use the site (admins are exempt)')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Network / IP data on profiles is ADMIN-ONLY
--
--    profiles rows are publicly readable (usernames, avatars), which also exposed
--    the network columns to every visitor. Row-level security cannot hide single
--    columns, so browsers (anon / authenticated roles) lose read AND write access
--    to exactly these columns. Admin screens read them through SECURITY DEFINER
--    functions (get_users_with_activity etc.), which are unaffected.
--
--    Rollback, if anything misbehaves:
--      GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_private_columns()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY[
        'ip_hash', 'ip_encrypted', 'ip_source', 'ip_address', 'real_ip', 'last_ip', 'last_ip_update',
        'country', 'city', 'isp',
        'vpn_detected', 'tor_detected', 'proxy_detected', 'hosting_detected', 'mobile_detected',
        'network_info', 'geo_mismatch', 'referrer', 'landing_page', 'utm'
    ]::text[];
$$;

-- Re-grants browser access to every profiles column except the private ones.
-- Runs automatically after ALTER TABLE profiles where event triggers are
-- available; otherwise run  SELECT public.refresh_profile_column_grants();
-- after adding a column to profiles.
CREATE OR REPLACE FUNCTION public.refresh_profile_column_grants()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cols TEXT;
BEGIN
    SELECT string_agg(quote_ident(c.column_name), ', ')
      INTO cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'profiles'
       AND c.column_name <> ALL (public.profile_private_columns());

    IF cols IS NULL THEN RETURN; END IF;

    REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM anon, authenticated;
    EXECUTE format('GRANT SELECT (%s), INSERT (%s), UPDATE (%s) ON public.profiles TO anon, authenticated', cols, cols, cols);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_profile_column_grants() FROM PUBLIC, anon, authenticated;

SELECT public.refresh_profile_column_grants();

-- One profile without the private columns (replaces select * in the app).
CREATE OR REPLACE FUNCTION public.get_profile_public(p_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT to_jsonb(p) - public.profile_private_columns()
      FROM public.profiles p
     WHERE p.id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_public(UUID) TO anon, authenticated;

-- Keep the grants in step when a column is added to profiles later.
CREATE OR REPLACE FUNCTION public.on_profiles_ddl_refresh_grants()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_event_trigger_ddl_commands() d
        WHERE d.object_identity = 'public.profiles'
    ) THEN
        PERFORM public.refresh_profile_column_grants();
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'refresh_profile_column_grants failed: %', SQLERRM;
END;
$$;

DO $$
BEGIN
    DROP EVENT TRIGGER IF EXISTS profiles_refresh_column_grants;
    CREATE EVENT TRIGGER profiles_refresh_column_grants
        ON ddl_command_end WHEN TAG IN ('ALTER TABLE')
        EXECUTE FUNCTION public.on_profiles_ddl_refresh_grants();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Event trigger not created (%). After adding a column to profiles run: SELECT public.refresh_profile_column_grants();', SQLERRM;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Guest network / device data is ADMIN-ONLY too
--
--    Browsers may read only the few guests columns the site itself needs to
--    recognise a returning guest. Everything else (IP hash, location, ISP, VPN
--    flags, device info, referrer, admin notes, ...) — including any column
--    added later — is readable only through the admin functions below.
--    Guests can still WRITE their row (insert / update are untouched).
--
--    Rollback:  GRANT SELECT ON public.guests TO anon, authenticated;
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_guest_column_grants()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cols TEXT;
BEGIN
    SELECT string_agg(quote_ident(c.column_name), ', ')
      INTO cols
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'guests'
       AND c.column_name = ANY (ARRAY[
            'id', 'anonymous_id', 'fingerprint', 'fingerprint_legacy',
            'status', 'post_count', 'trust_score', 'email', 'email_verified',
            'created_at', 'last_seen_at'
       ]);

    IF cols IS NULL THEN RETURN; END IF;

    REVOKE SELECT ON public.guests FROM anon, authenticated;
    EXECUTE format('GRANT SELECT (%s) ON public.guests TO anon, authenticated', cols);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_guest_column_grants() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF to_regclass('public.guests') IS NOT NULL THEN
        PERFORM public.refresh_guest_column_grants();
    END IF;
END $$;

-- Full guest rows for the admin panel (replaces select * on guests).
CREATE OR REPLACE FUNCTION public.admin_get_guests(p_id UUID DEFAULT NULL)
RETURNS SETOF JSONB
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
    SELECT to_jsonb(g)
      FROM public.guests g
     WHERE p_id IS NULL OR g.id = p_id
     ORDER BY g.last_seen_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_guests(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_guests(UUID) TO authenticated;

SELECT 'last activity + server-side IP + VPN gate + admin-only network data installed' AS status;
