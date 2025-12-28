-- ============================================================================
-- FIX DM SYSTEM: Voice Messages + Notifications
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. VOICE MESSAGES STORAGE BUCKET
-- ============================================================================

-- Create bucket for voice messages (run in Storage section if this fails)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('voice-messages', 'voice-messages', true, 10485760) -- 10MB limit
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

-- Drop existing policies
DROP POLICY IF EXISTS "Voice messages are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload voice messages" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their voice messages" ON storage.objects;

-- Public read access
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
-- 2. DM NOTIFICATION TRIGGER
-- ============================================================================

-- Drop ALL existing triggers and function (with CASCADE to handle dependencies)
DROP TRIGGER IF EXISTS on_dm_sent ON session_messages;
DROP TRIGGER IF EXISTS on_dm_notify ON messages;
DROP TRIGGER IF EXISTS on_dm_notify ON session_messages;
DROP FUNCTION IF EXISTS notify_on_dm() CASCADE;

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

-- Create trigger
CREATE TRIGGER on_dm_sent
  AFTER INSERT ON session_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_dm();

-- ============================================================================
-- 3. VERIFY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ DM SYSTEM FIXES APPLIED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '1. Voice messages bucket created with RLS';
  RAISE NOTICE '2. DM notification trigger installed';
  RAISE NOTICE '';
  RAISE NOTICE 'Test by:';
  RAISE NOTICE '  - Recording a voice message in DMs';
  RAISE NOTICE '  - Sending a DM and checking notifications';
END $$;
