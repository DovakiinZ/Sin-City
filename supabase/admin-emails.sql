-- Function to fetch users with their emails (Admin Only)
CREATE OR REPLACE FUNCTION public.get_users_with_email()
RETURNS TABLE (
    id UUID,
    username TEXT,
    email VARCHAR,
    role TEXT,
    created_at TIMESTAMPTZ,
    country TEXT,
    city TEXT,
    ip_hash TEXT,
    isp TEXT,
    vpn_detected BOOLEAN,
    tor_detected BOOLEAN,
    last_ip_update TIMESTAMPTZ,
    last_seen TIMESTAMPTZ
) AS $$
BEGIN
    -- Check if requesting user is admin
    IF NOT public.check_admin_access() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        au.email::VARCHAR,
        p.role,
        p.created_at,
        p.country,
        p.city,
        p.ip_hash,
        p.isp,
        p.vpn_detected,
        p.tor_detected,
        p.last_ip_update,
        p.last_seen
    FROM public.profiles p
    JOIN auth.users au ON p.id = au.id
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_users_with_email() TO authenticated;
