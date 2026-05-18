-- ============================================================================
-- SIMPLE FIX: Just make the tables work without complex migration
-- Run this ALL AT ONCE
-- ============================================================================

-- Step 1: Drop the problematic unique constraint temporarily
ALTER TABLE public.message_sessions DROP CONSTRAINT IF EXISTS unique_session;
ALTER TABLE public.message_sessions DROP CONSTRAINT IF EXISTS unique_message_session;

-- Step 2: For orphaned session_messages, we'll insert the missing sessions with new IDs
-- First, let's see what sessions are missing

-- Insert missing sessions from chat_sessions into message_sessions
-- Using the SAME ID so session_messages FK will work
INSERT INTO public.message_sessions (id, participant_1, participant_2, status, started_at, last_activity_at, created_at)
SELECT 
  cs.id,
  LEAST(cs.participant_1, cs.participant_2),
  GREATEST(cs.participant_1, cs.participant_2),
  'active',
  cs.created_at,
  COALESCE(cs.updated_at, cs.created_at),
  cs.created_at
FROM public.chat_sessions cs
WHERE NOT EXISTS (
  SELECT 1 FROM public.message_sessions ms WHERE ms.id = cs.id
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Delete any truly orphaned messages (sessions that don't exist anywhere)
DELETE FROM public.session_messages 
WHERE session_id NOT IN (SELECT id FROM public.message_sessions)
  AND session_id NOT IN (SELECT id FROM public.chat_sessions);

-- Step 4: Now fix the foreign key constraint
ALTER TABLE public.session_messages DROP CONSTRAINT IF EXISTS session_messages_session_id_fkey;

ALTER TABLE public.session_messages
  ADD CONSTRAINT session_messages_session_id_fkey 
  FOREIGN KEY (session_id) REFERENCES public.message_sessions(id) ON DELETE CASCADE;

-- Step 5: Re-add unique constraint (but allow for slight differences)
-- Add unique constraint back
ALTER TABLE public.message_sessions 
  ADD CONSTRAINT unique_message_session UNIQUE(participant_1, participant_2);

-- Step 6: Enable RLS
ALTER TABLE public.message_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

-- Step 7: Create policies for message_sessions
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

-- Step 8: Create policies for session_messages
DROP POLICY IF EXISTS "Users can view messages in their sessions" ON public.session_messages;
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

-- Step 9: Create the get_or_create_session function
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

-- Step 10: Voice bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('voice-messages', 'voice-messages', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

DROP POLICY IF EXISTS "Voice messages are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload voice messages" ON storage.objects;

CREATE POLICY "Voice messages are publicly accessible"
ON storage.objects FOR SELECT USING (bucket_id = 'voice-messages');

CREATE POLICY "Users can upload voice messages"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voice-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Step 11: Enable realtime
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_sessions;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Done!
SELECT 'SUCCESS' as status, 
       (SELECT COUNT(*) FROM public.message_sessions) as total_sessions,
       (SELECT COUNT(*) FROM public.session_messages) as total_messages;
