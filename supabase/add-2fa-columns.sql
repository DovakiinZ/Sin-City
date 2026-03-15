-- Add phone and mfa_enabled columns to profiles table
-- Run this in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;

-- Update the get_users_with_emails function to include phone
DROP FUNCTION IF EXISTS get_users_with_emails();

CREATE OR REPLACE FUNCTION get_users_with_emails()
RETURNS TABLE (
    id UUID,
    username TEXT,
    email TEXT,
    phone TEXT,
    mfa_enabled BOOLEAN,
    created_at TIMESTAMPTZ,
    avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username::TEXT,
        u.email::TEXT,
        p.phone::TEXT,
        COALESCE(p.mfa_enabled, false),
        p.created_at,
        p.avatar_url::TEXT
    FROM profiles p
    LEFT JOIN auth.users u ON p.id = u.id
    ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_users_with_emails() TO authenticated;
