-- ============================================================================
-- Network / IP / device data on profiles and guests: ADMIN-ONLY
-- Run once in the Supabase SQL Editor, AFTER 2026-11-26-last-activity-vpn-gate.sql.
-- Safe to re-run. If the editor shows an error, nothing in this file was applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Network / IP data on profiles is ADMIN-ONLY
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
        'network_info', 'geo_mismatch', 'referrer', 'landing_page', 'utm',
        -- contact / account-security details
        'phone', 'email', 'gravatar_hash', 'has_gravatar', 'mfa_enabled',
        'email_mx_valid', 'disposable_email_detected'
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
       AND c.column_name::text <> ALL (public.profile_private_columns());

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
-- 2. Guest network / device data is ADMIN-ONLY too
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
       AND c.column_name::text = ANY (ARRAY[
            'id', 'anonymous_id', 'fingerprint', 'fingerprint_legacy',
            'status', 'post_count', 'trust_score', 'email', 'email_verified',
            'created_at', 'last_seen_at'
       ]::text[]);

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

-- ----------------------------------------------------------------------------
-- Result: both rows must say "hidden from browsers".
-- ----------------------------------------------------------------------------
SELECT 'profiles.ip_hash' AS item,
       CASE WHEN has_column_privilege('anon', 'public.profiles', 'ip_hash', 'SELECT')
            THEN 'STILL READABLE' ELSE 'hidden from browsers' END AS status
UNION ALL
SELECT 'profiles.phone',
       CASE WHEN has_column_privilege('anon', 'public.profiles', 'phone', 'SELECT')
            THEN 'STILL READABLE' ELSE 'hidden from browsers' END
UNION ALL
SELECT 'guests.ip_hash',
       CASE WHEN has_column_privilege('anon', 'public.guests', 'ip_hash', 'SELECT')
            THEN 'STILL READABLE' ELSE 'hidden from browsers' END;
