-- ============================================================================
-- ADD CONVERSATION READ STATUS TRACKING
-- ============================================================================

-- 1. Create table to track when a user last read a conversation
CREATE TABLE IF NOT EXISTS public.conversation_read_status (
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- 2. Enable RLS
ALTER TABLE public.conversation_read_status ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Users can view their own read status
CREATE POLICY "Users can view own read status"
  ON public.conversation_read_status FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own read status
CREATE POLICY "Users can insert own read status"
  ON public.conversation_read_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own read status
CREATE POLICY "Users can update own read status"
  ON public.conversation_read_status FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. Function to mark conversation as read (Upsert)
CREATE OR REPLACE FUNCTION mark_conversation_as_read(target_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.conversation_read_status (conversation_id, user_id, last_read_at)
  VALUES (target_conversation_id, auth.uid(), now())
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;

-- 5. Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.conversation_read_status TO authenticated;
GRANT EXECUTE ON FUNCTION mark_conversation_as_read(UUID) TO authenticated;

-- 6. Add to Realtime (so we can subscribe to changes if needed, though usually local optimistic update + refetch is enough)
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_read_status;

DO $$
BEGIN
  RAISE NOTICE '✅ Conversation read status table and functions created.';
END $$;
