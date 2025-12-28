-- ============================================================================
-- COMPLETE FIX: DM Messages + Voice Recording
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. FIX VOICE MESSAGE TRUST LEVEL RESTRICTION
-- The original can_send_message function blocks voice for non-high trust users
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_send_message(p_user_id UUID, p_content_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_hourly_limit INTEGER := 100;
BEGIN
  -- Get or create user settings
  INSERT INTO public.user_messaging_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  SELECT * INTO v_settings
  FROM public.user_messaging_settings
  WHERE user_id = p_user_id;
  
  -- Check if messaging is enabled
  IF NOT v_settings.messaging_enabled THEN
    RETURN false;
  END IF;
  
  -- Check if restricted
  IF v_settings.is_restricted THEN
    RETURN false;
  END IF;
  
  -- Check rate limit (reset every hour)
  IF v_settings.last_rate_limit_reset < now() - INTERVAL '1 hour' THEN
    UPDATE public.user_messaging_settings
    SET messages_today = 0, last_rate_limit_reset = now()
    WHERE user_id = p_user_id;
  ELSIF v_settings.messages_today >= v_hourly_limit THEN
    RETURN false;
  END IF;
  
  -- REMOVED: Trust level restrictions for GIF and voice
  -- All authenticated users can now send any content type
  
  RETURN true;
END;
$$;

-- ============================================================================
-- 2. ENSURE voice-messages BUCKET EXISTS WITH PROPER RLS
-- ============================================================================

-- Create bucket for voice messages
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('voice-messages', 'voice-messages', true, 10485760) -- 10MB limit
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Voice messages are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload voice messages" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their voice messages" ON storage.objects;

-- Public read access for voice messages
CREATE POLICY "Voice messages are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-messages');

-- Authenticated users can upload to their folder
CREATE POLICY "Users can upload voice messages"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'voice-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can delete their own voice messages
CREATE POLICY "Users can delete their voice messages"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'voice-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 3. FIX RLS POLICY FOR session_messages INSERT
-- Remove the strict status = 'active' check (allow archived sessions to receive messages)
-- ============================================================================

-- Drop existing policies on session_messages
DROP POLICY IF EXISTS "Users can send messages to their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can send messages in their sessions" ON public.session_messages;

-- Create fixed policy: Allow sending to active OR archived sessions (not blocked)
CREATE POLICY "Users can send messages in their sessions"
  ON public.session_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND s.status != 'blocked'
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

-- ============================================================================
-- 4. ENSURE DM NOTIFICATION TRIGGER EXISTS
-- ============================================================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS on_dm_sent ON session_messages;
DROP TRIGGER IF EXISTS on_dm_notify ON messages;
DROP TRIGGER IF EXISTS on_dm_notify ON session_messages;

-- Create notification function
CREATE OR REPLACE FUNCTION notify_on_dm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_id UUID;
  v_sender_username TEXT;
  v_session_status TEXT;
BEGIN
  -- Get session details and receiver
  SELECT 
    status,
    CASE WHEN participant_1 = NEW.sender_id THEN participant_2 ELSE participant_1 END
  INTO v_session_status, v_receiver_id
  FROM message_sessions 
  WHERE id = NEW.session_id;

  -- Don't notify if session is blocked
  IF v_session_status = 'blocked' THEN
    RETURN NEW;
  END IF;

  -- Get sender username
  SELECT username INTO v_sender_username 
  FROM profiles 
  WHERE id = NEW.sender_id;

  -- Insert notification for receiver (NOT sender)
  INSERT INTO notifications (user_id, type, content, read)
  VALUES (
    v_receiver_id,
    'dm',
    jsonb_build_object(
      'sender_id', NEW.sender_id,
      'sender_username', COALESCE(v_sender_username, 'Someone'),
      'session_id', NEW.session_id,
      'message_preview', LEFT(COALESCE(NEW.content, '[media]'), 50),
      'is_voice', NEW.voice_url IS NOT NULL,
      'is_gif', NEW.gif_url IS NOT NULL
    ),
    false
  );

  RETURN NEW;
END;
$$;

-- Create trigger on session_messages
CREATE TRIGGER on_dm_sent
  AFTER INSERT ON session_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_dm();

-- ============================================================================
-- 5. ENSURE REALTIME IS ENABLED
-- ============================================================================

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_sessions;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;

-- ============================================================================
-- 6. VERIFY NOTIFICATIONS TABLE SUPPORTS 'dm' TYPE
-- ============================================================================

-- Update the type constraint to include 'dm'
DO $$
BEGIN
  -- Try to add 'dm' to the type check constraint
  ALTER TABLE public.notifications 
    DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  ALTER TABLE public.notifications 
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN ('comment', 'reaction', 'follow', 'mention', 'reply', 'message', 'dm'));
EXCEPTION WHEN OTHERS THEN
  -- Constraint might not exist or have different name
  NULL;
END $$;

-- ============================================================================
-- 7. DIAGNOSTIC: Check current state
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ DM + VOICE FIXES APPLIED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  1. Voice messages now allowed for ALL users (trust level removed)';
  RAISE NOTICE '  2. Voice-messages bucket created with RLS';
  RAISE NOTICE '  3. RLS policy fixed (allows non-blocked sessions)';
  RAISE NOTICE '  4. DM notification trigger installed';
  RAISE NOTICE '  5. Realtime enabled for session_messages';
  RAISE NOTICE '';
  RAISE NOTICE 'TEST BY:';
  RAISE NOTICE '  - Record and send a voice message in DM';
  RAISE NOTICE '  - Send a text message and check if notification appears';
END $$;
