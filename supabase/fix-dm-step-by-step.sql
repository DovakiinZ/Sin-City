-- ============================================================================
-- STEP-BY-STEP FIX: Run these steps ONE AT A TIME in order
-- ============================================================================

-- ============================================================================
-- STEP 1: First, ensure message_sessions table exists
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
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Run this first, then proceed to step 2

-- ============================================================================
-- STEP 2: Copy sessions from chat_sessions to message_sessions
-- This migrates existing data
-- ============================================================================

-- First, check if chat_sessions exists and has data
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check if chat_sessions table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_sessions') THEN
    SELECT COUNT(*) INTO v_count FROM public.chat_sessions;
    RAISE NOTICE 'Found % sessions in chat_sessions', v_count;
    
    -- Insert sessions that don't already exist in message_sessions
    -- We use the same ID so that session_messages FK will work
    INSERT INTO public.message_sessions (id, participant_1, participant_2, status, started_at, last_activity_at, created_at)
    SELECT 
      cs.id,
      LEAST(cs.participant_1, cs.participant_2),  -- Ensure participant_1 < participant_2
      GREATEST(cs.participant_1, cs.participant_2),
      'active',
      cs.created_at,
      cs.updated_at,
      cs.created_at
    FROM public.chat_sessions cs
    WHERE NOT EXISTS (
      SELECT 1 FROM public.message_sessions ms WHERE ms.id = cs.id
    )
    ON CONFLICT (id) DO NOTHING;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % sessions to message_sessions', v_count;
  ELSE
    RAISE NOTICE 'chat_sessions table does not exist';
  END IF;
END $$;

-- Run this second, then proceed to step 3

-- ============================================================================
-- STEP 3: Find orphaned session_messages and insert their sessions
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  v_migrated INTEGER := 0;
BEGIN
  -- Find session IDs in session_messages that don't exist in message_sessions
  FOR rec IN 
    SELECT DISTINCT sm.session_id 
    FROM public.session_messages sm
    WHERE NOT EXISTS (
      SELECT 1 FROM public.message_sessions ms WHERE ms.id = sm.session_id
    )
  LOOP
    -- Try to find this session in chat_sessions
    IF EXISTS (SELECT 1 FROM public.chat_sessions cs WHERE cs.id = rec.session_id) THEN
      INSERT INTO public.message_sessions (id, participant_1, participant_2, status, started_at, last_activity_at, created_at)
      SELECT 
        cs.id,
        LEAST(cs.participant_1, cs.participant_2),
        GREATEST(cs.participant_1, cs.participant_2),
        'active',
        cs.created_at,
        cs.updated_at,
        cs.created_at
      FROM public.chat_sessions cs
      WHERE cs.id = rec.session_id
      ON CONFLICT (id) DO NOTHING;
      
      v_migrated := v_migrated + 1;
    ELSE
      -- Session doesn't exist anywhere - delete the orphaned messages
      DELETE FROM public.session_messages WHERE session_id = rec.session_id;
      RAISE NOTICE 'Deleted orphaned messages for session %', rec.session_id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migrated % additional sessions, cleaned up orphans', v_migrated;
END $$;

-- Run this third, then proceed to step 4

-- ============================================================================
-- STEP 4: Now fix the foreign key constraint
-- ============================================================================

ALTER TABLE public.session_messages DROP CONSTRAINT IF EXISTS session_messages_session_id_fkey;
ALTER TABLE public.session_messages DROP CONSTRAINT IF EXISTS fk_session_messages_session;

ALTER TABLE public.session_messages
  ADD CONSTRAINT session_messages_session_id_fkey 
  FOREIGN KEY (session_id) REFERENCES public.message_sessions(id) ON DELETE CASCADE;

-- Run this fourth, then proceed to step 5

-- ============================================================================
-- STEP 5: Set up RLS and policies
-- ============================================================================

-- message_sessions RLS
ALTER TABLE public.message_sessions ENABLE ROW LEVEL SECURITY;

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

-- session_messages RLS
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can send messages to their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can send messages in their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Users can update read status" ON public.session_messages;

CREATE POLICY "Users can view messages in their sessions"
  ON public.session_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

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

CREATE POLICY "Users can update read status"
  ON public.session_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

-- Run this fifth, then proceed to step 6

-- ============================================================================
-- STEP 6: Create get_or_create_session function
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
  
  IF v_current_user < p_other_user_id THEN
    v_user_1 := v_current_user;
    v_user_2 := p_other_user_id;
  ELSE
    v_user_1 := p_other_user_id;
    v_user_2 := v_current_user;
  END IF;
  
  SELECT id INTO v_session_id
  FROM public.message_sessions
  WHERE participant_1 = v_user_1 AND participant_2 = v_user_2;
  
  IF v_session_id IS NULL THEN
    INSERT INTO public.message_sessions (participant_1, participant_2)
    VALUES (v_user_1, v_user_2)
    RETURNING id INTO v_session_id;
  ELSIF (SELECT status FROM public.message_sessions WHERE id = v_session_id) = 'archived' THEN
    UPDATE public.message_sessions
    SET status = 'active', last_activity_at = now(), archived_at = NULL
    WHERE id = v_session_id;
  END IF;
  
  RETURN v_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_session(UUID) TO authenticated;

-- Run this sixth, then proceed to step 7

-- ============================================================================
-- STEP 7: Voice messages bucket + Realtime
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

-- Enable realtime
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_sessions;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_message_sessions_p1 ON public.message_sessions(participant_1);
CREATE INDEX IF NOT EXISTS idx_message_sessions_p2 ON public.message_sessions(participant_2);
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON public.session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_created ON public.session_messages(created_at DESC);

-- ============================================================================
-- DONE! Test by clicking the message icon in the bottom right corner
-- ============================================================================

SELECT 'SUCCESS! DM System Ready' as status;
