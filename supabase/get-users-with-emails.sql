-- Create a function to get users with their emails from auth.users
-- Run this in Supabase SQL Editor

-- Drop old function first
DROP FUNCTION IF EXISTS get_users_with_emails();

-- Create a secure function that admins can use to get user details
CREATE OR REPLACE FUNCTION get_users_with_emails()
RETURNS TABLE (
    id UUID,
    username TEXT,
    email TEXT,
    phone TEXT,
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
        u.phone::TEXT,
        p.created_at,
        p.avatar_url::TEXT
    FROM profiles p
    LEFT JOIN auth.users u ON p.id = u.id
    ORDER BY p.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_users_with_emails() TO authenticated;

