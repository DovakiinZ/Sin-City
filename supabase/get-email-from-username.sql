-- Function to get email from username for login
-- This allows users to login with username instead of email

CREATE OR REPLACE FUNCTION public.get_email_from_username(input_username text)
RETURNS text AS $$
DECLARE
  user_email text;
  user_uuid uuid;
BEGIN
  -- Get the user ID from profiles table
  SELECT id INTO user_uuid
  FROM public.profiles
  WHERE username = input_username;
  
  IF user_uuid IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get email from auth.users table
  SELECT email INTO user_email
  FROM auth.users
  WHERE id = user_uuid;
  
  RETURN user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.get_email_from_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_from_username(text) TO anon;

-- Test the function (optional - uncomment to test)
-- SELECT public.get_email_from_username('your-username-here');
