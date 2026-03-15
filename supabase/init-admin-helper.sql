-- ==============================================================================
-- ADMIN HELPER FUNCTIONS (RENAMED TO AVOID CONFLICTS)
-- ==============================================================================

-- Create a uniquely named function to check admin status
CREATE OR REPLACE FUNCTION public.check_admin_access()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check profiles table for role
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (role = 'admin' OR role = 'super_admin')
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_admin_access TO authenticated;
