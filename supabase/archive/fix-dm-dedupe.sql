-- ============================================================================
-- FIX DUPLICATES FIRST - Run this BEFORE anything else
-- ============================================================================

-- Step 1: Find and remove duplicate sessions (keep the one with more messages or oldest)
-- First, update session_messages to point to the session we're keeping
DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
  delete_ids UUID[];
BEGIN
  RAISE NOTICE 'Finding duplicate sessions...';
  
  -- Find all participant pairs that have more than one session
  FOR dup IN 
    SELECT participant_1, participant_2, array_agg(id ORDER BY created_at) as session_ids
    FROM public.message_sessions
    GROUP BY participant_1, participant_2
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the first (oldest) session
    keep_id := dup.session_ids[1];
    delete_ids := dup.session_ids[2:];
    
    RAISE NOTICE 'Keeping session %, deleting %', keep_id, delete_ids;
    
    -- Move all messages from duplicate sessions to the one we're keeping
    UPDATE public.session_messages 
    SET session_id = keep_id 
    WHERE session_id = ANY(delete_ids);
    
    -- Delete the duplicate sessions
    DELETE FROM public.message_sessions 
    WHERE id = ANY(delete_ids);
  END LOOP;
  
  RAISE NOTICE 'Deduplication complete!';
END $$;

-- Step 2: Verify no duplicates remain
SELECT participant_1, participant_2, COUNT(*) as count
FROM public.message_sessions
GROUP BY participant_1, participant_2
HAVING COUNT(*) > 1;

-- Step 3: Now add the unique constraint
ALTER TABLE public.message_sessions 
  DROP CONSTRAINT IF EXISTS unique_message_session;

ALTER TABLE public.message_sessions
  DROP CONSTRAINT IF EXISTS unique_session;

ALTER TABLE public.message_sessions 
  ADD CONSTRAINT unique_message_session UNIQUE(participant_1, participant_2);

-- Step 4: Fix FK constraint on session_messages
ALTER TABLE public.session_messages 
  DROP CONSTRAINT IF EXISTS session_messages_session_id_fkey;

ALTER TABLE public.session_messages
  ADD CONSTRAINT session_messages_session_id_fkey 
  FOREIGN KEY (session_id) REFERENCES public.message_sessions(id) ON DELETE CASCADE;

-- Step 5: Enable RLS
ALTER TABLE public.message_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

-- Step 6: Policies for message_sessions
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

-- Step 7: Policies for session_messages
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

-- Step 8: Create get_or_create_session function
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

-- Step 9: Voice bucket
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

-- Step 10: Realtime
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_sessions;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Done!
SELECT 'SUCCESS' as status, 
       (SELECT COUNT(*) FROM public.message_sessions) as sessions,
       (SELECT COUNT(*) FROM public.session_messages) as messages;
