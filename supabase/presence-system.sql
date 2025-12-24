-- ============================================================================
-- PRESENCE SYSTEM FOR SIN CITY
-- Run in Supabase SQL Editor
-- ============================================================================

-- Add last_seen to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at DESC);

-- Create heartbeat function
CREATE OR REPLACE FUNCTION update_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    UPDATE profiles 
    SET last_seen_at = NOW(), is_online = true
    WHERE id = auth.uid();
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_presence() TO authenticated;

-- Function to get presence status
CREATE OR REPLACE FUNCTION get_presence_status(user_uuid UUID)
RETURNS TABLE (status TEXT, last_seen TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  seen_at TIMESTAMPTZ;
  diff_minutes INT;
BEGIN
  SELECT last_seen_at INTO seen_at FROM profiles WHERE id = user_uuid;
  
  IF seen_at IS NULL THEN
    RETURN QUERY SELECT 'offline'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  diff_minutes := EXTRACT(EPOCH FROM (NOW() - seen_at)) / 60;
  
  IF diff_minutes < 2 THEN
    RETURN QUERY SELECT 'active_now'::TEXT, seen_at;
  ELSIF diff_minutes < 60 THEN
    RETURN QUERY SELECT 'active_recently'::TEXT, seen_at;
  ELSE
    RETURN QUERY SELECT 'offline'::TEXT, seen_at;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_presence_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_presence_status(UUID) TO anon;

-- ============================================================================
-- DONE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Presence system created!';
  RAISE NOTICE 'Columns added: last_seen_at, is_online';
  RAISE NOTICE 'Functions added: update_presence(), get_presence_status()';
END $$;
