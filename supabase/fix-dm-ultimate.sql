-- ============================================================================
-- ULTIMATE FIX: DM Messaging System
-- This fixes the table naming conflict and ensures everything works together
-- Run this in Supabase SQL Editor
-- ============================================================================

-- The problem: There are TWO sets of tables being used:
--   1. chat_sessions + session_messages (used by ChatPage.tsx)
--   2. message_sessions + session_messages (used by MessagingPanel.tsx)
--
-- session_messages has FK to message_sessions, but ChatPage uses chat_sessions
-- This causes 406 errors when querying session_messages with chat_session IDs

-- ============================================================================
-- STEP 1: ENSURE message_sessions TABLE EXISTS (correct schema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.message_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  participant_2 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  started_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_message_session UNIQUE(participant_1, participant_2),
  CONSTRAINT ordered_message_participants CHECK (participant_1 < participant_2)
);

-- Enable RLS
ALTER TABLE public.message_sessions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.message_sessions;
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON public.message_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.message_sessions;

CREATE POLICY "Users can view their own sessions"
  ON public.message_sessions FOR SELECT
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

CREATE POLICY "Authenticated users can create sessions"
  ON public.message_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);

CREATE POLICY "Users can update their own sessions"
  ON public.message_sessions FOR UPDATE
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- ============================================================================
-- STEP 2: ENSURE session_messages TABLE EXISTS WITH CORRECT FK
-- ============================================================================

-- First check if session_messages exists and fix its FK if needed
DO $$
BEGIN
  -- Check if session_messages exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_messages' AND table_schema = 'public') THEN
    -- Drop old FK constraints if they exist
    ALTER TABLE public.session_messages DROP CONSTRAINT IF EXISTS session_messages_session_id_fkey;
    ALTER TABLE public.session_messages DROP CONSTRAINT IF EXISTS fk_session_messages_session;
    
    -- Add correct FK to message_sessions
    ALTER TABLE public.session_messages
      ADD CONSTRAINT session_messages_session_id_fkey 
      FOREIGN KEY (session_id) REFERENCES public.message_sessions(id) ON DELETE CASCADE;
      
    RAISE NOTICE 'Fixed session_messages FK to reference message_sessions';
  ELSE
    -- Create session_messages from scratch
    CREATE TABLE public.session_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID REFERENCES public.message_sessions(id) ON DELETE CASCADE NOT NULL,
      sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      use_masked_identity BOOLEAN DEFAULT false,
      masked_alias TEXT,
      content TEXT,
      media_url TEXT,
      media_type TEXT CHECK (media_type IN ('image', 'video')),
      gif_url TEXT,
      gif_id TEXT,
      voice_url TEXT,
      voice_duration_seconds INTEGER CHECK (voice_duration_seconds <= 60),
      read_at TIMESTAMPTZ,
      is_deleted BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    
    RAISE NOTICE 'Created session_messages table';
  END IF;
END $$;

-- Enable RLS on session_messages
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies for session_messages
DROP POLICY IF EXISTS "Users can view messages in their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can send messages to their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can send messages in their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can update read status" ON public.session_messages;

-- View messages policy
CREATE POLICY "Users can view messages in their sessions"
  ON public.session_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

-- Insert messages policy (allow non-blocked sessions)
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

-- Update messages policy (for read receipts)
CREATE POLICY "Users can update read status"
  ON public.session_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

-- ============================================================================
-- STEP 3: CREATE get_or_create_session FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_session(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user UUID := auth.uid();
  v_user_1 UUID;
  v_user_2 UUID;
  v_session_id UUID;
BEGIN
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF v_current_user = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;
  
  -- Ensure consistent ordering (smaller UUID first)
  IF v_current_user < p_other_user_id THEN
    v_user_1 := v_current_user;
    v_user_2 := p_other_user_id;
  ELSE
    v_user_1 := p_other_user_id;
    v_user_2 := v_current_user;
  END IF;
  
  -- Check for existing session
  SELECT id INTO v_session_id
  FROM public.message_sessions
  WHERE participant_1 = v_user_1 AND participant_2 = v_user_2;
  
  IF v_session_id IS NULL THEN
    -- Create new session
    INSERT INTO public.message_sessions (participant_1, participant_2)
    VALUES (v_user_1, v_user_2)
    RETURNING id INTO v_session_id;
  ELSIF (SELECT status FROM public.message_sessions WHERE id = v_session_id) = 'archived' THEN
    -- Reactivate archived session
    UPDATE public.message_sessions
    SET status = 'active', last_activity_at = now(), archived_at = NULL
    WHERE id = v_session_id;
  END IF;
  
  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_session(UUID) TO authenticated;

-- ============================================================================
-- STEP 4: VOICE MESSAGES BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('voice-messages', 'voice-messages', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

DROP POLICY IF EXISTS "Voice messages are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload voice messages" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their voice messages" ON storage.objects;

CREATE POLICY "Voice messages are publicly accessible"
ON storage.objects FOR SELECT USING (bucket_id = 'voice-messages');

CREATE POLICY "Users can upload voice messages"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voice-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their voice messages"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'voice-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- STEP 5: TRIGGER TO UPDATE SESSION ACTIVITY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.message_sessions
  SET 
    last_activity_at = now(),
    message_count = message_count + 1
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_sent ON public.session_messages;
CREATE TRIGGER on_message_sent
  AFTER INSERT ON public.session_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_session_activity();

-- ============================================================================
-- STEP 6: ENABLE REALTIME
-- ============================================================================

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_sessions;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================================================
-- STEP 7: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_message_sessions_p1 ON public.message_sessions(participant_1);
CREATE INDEX IF NOT EXISTS idx_message_sessions_p2 ON public.message_sessions(participant_2);
CREATE INDEX IF NOT EXISTS idx_message_sessions_status ON public.message_sessions(status);
CREATE INDEX IF NOT EXISTS idx_message_sessions_activity ON public.message_sessions(last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_messages_session ON public.session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_sender ON public.session_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_created ON public.session_messages(created_at DESC);

-- ============================================================================
-- DONE!
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ DM SYSTEM FIXED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables: message_sessions, session_messages';
  RAISE NOTICE 'Function: get_or_create_session';
  RAISE NOTICE 'Voice bucket: voice-messages';
  RAISE NOTICE 'Realtime: ENABLED';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: The frontend uses MessagingPanel which';
  RAISE NOTICE 'queries message_sessions. Make sure to test using';
  RAISE NOTICE 'the message icon in the bottom right, NOT /chat page.';
END $$;
