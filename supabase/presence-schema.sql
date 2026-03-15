-- Add last_seen to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT now();

-- Permissions: Everyone can read last_seen (needed for status indicators)
-- Existing select policy for profiles might already cover it, but let's be sure.
-- "Public profiles are viewable by everyone" usually exists.

-- Function to update last_seen
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen = now()
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Security Definier allows it to run with elevated privileges if needed, 
-- but auth.uid() restriction ensures safety.
-- Ideally user can update their own row anyway.
 
GRANT EXECUTE ON FUNCTION public.update_last_seen() TO authenticated;
