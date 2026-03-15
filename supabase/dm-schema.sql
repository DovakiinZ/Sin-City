-- ============================================================================
-- DIRECT MESSAGES SCHEMA FOR SIN CITY
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. CONVERSATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  participant_2 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Ensure consistent ordering (smaller UUID first) to prevent duplicates
  CONSTRAINT unique_conversation UNIQUE(participant_1, participant_2),
  CONSTRAINT ordered_participants CHECK (participant_1 < participant_2)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_participant_1 ON public.conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_2 ON public.conversations(participant_2);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- ============================================================================
-- 2. MESSAGES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  attachments JSONB, -- [{url: string, type: 'image'|'video'|'file', name: string}]
  read_at TIMESTAMPTZ, -- NULL = unread
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages(read_at) WHERE read_at IS NULL;

-- ============================================================================
-- 3. USER SETTINGS TABLE (for read receipts toggle)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  show_read_receipts BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. ENABLE RLS
-- ============================================================================

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. RLS POLICIES - CONVERSATIONS
-- ============================================================================

-- Users can only see conversations they're part of
CREATE POLICY "Users can view own conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- Users can create conversations they're part of
CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- Users can update conversations they're part of (for last_message_at)
CREATE POLICY "Users can update own conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- ============================================================================
-- 6. RLS POLICIES - MESSAGES
-- ============================================================================

-- Users can only see messages in their conversations
CREATE POLICY "Users can view messages in own conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c 
      WHERE c.id = conversation_id 
      AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- Users can send messages in their conversations
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversations c 
      WHERE c.id = conversation_id 
      AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- Users can update messages (to mark as read)
CREATE POLICY "Users can update messages in own conversations"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c 
      WHERE c.id = conversation_id 
      AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- ============================================================================
-- 7. RLS POLICIES - USER SETTINGS
-- ============================================================================

CREATE POLICY "Users can view own settings"
  ON public.user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own settings"
  ON public.user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON public.user_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 8. FUNCTIONS
-- ============================================================================

-- Function to get or create a conversation between two users
CREATE OR REPLACE FUNCTION get_or_create_conversation(other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_id UUID;
  user_1 UUID;
  user_2 UUID;
BEGIN
  -- Ensure consistent ordering
  IF auth.uid() < other_user_id THEN
    user_1 := auth.uid();
    user_2 := other_user_id;
  ELSE
    user_1 := other_user_id;
    user_2 := auth.uid();
  END IF;

  -- Try to find existing conversation
  SELECT id INTO conversation_id
  FROM public.conversations
  WHERE participant_1 = user_1 AND participant_2 = user_2;

  -- Create if doesn't exist
  IF conversation_id IS NULL THEN
    INSERT INTO public.conversations (participant_1, participant_2)
    VALUES (user_1, user_2)
    RETURNING id INTO conversation_id;
  END IF;

  RETURN conversation_id;
END;
$$;

-- Function to update last_message_at when a message is sent
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Trigger to auto-update conversation timestamp
DROP TRIGGER IF EXISTS on_message_sent ON public.messages;
CREATE TRIGGER on_message_sent
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Function to create DM notification
CREATE OR REPLACE FUNCTION notify_on_dm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recipient_id UUID;
  sender_username TEXT;
BEGIN
  -- Get the recipient (the other participant)
  SELECT 
    CASE 
      WHEN c.participant_1 = NEW.sender_id THEN c.participant_2
      ELSE c.participant_1
    END INTO recipient_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  -- Get sender username
  SELECT username INTO sender_username
  FROM public.profiles
  WHERE id = NEW.sender_id;

  -- Create notification for recipient
  INSERT INTO public.notifications (user_id, type, content)
  VALUES (
    recipient_id,
    'message',
    jsonb_build_object(
      'conversationId', NEW.conversation_id,
      'senderId', NEW.sender_id,
      'senderUsername', sender_username,
      'preview', LEFT(NEW.content, 50)
    )
  );

  RETURN NEW;
END;
$$;

-- Trigger for DM notifications
DROP TRIGGER IF EXISTS on_dm_notify ON public.messages;
CREATE TRIGGER on_dm_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_dm();

-- ============================================================================
-- 9. UPDATE NOTIFICATIONS TABLE (add 'message' type)
-- ============================================================================

-- Alter the check constraint to include 'message' type
ALTER TABLE public.notifications 
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications 
  ADD CONSTRAINT notifications_type_check 
  CHECK (type IN ('comment', 'reaction', 'follow', 'mention', 'reply', 'message'));

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_or_create_conversation(UUID) TO authenticated;

-- ============================================================================
-- 11. ENABLE REALTIME
-- ============================================================================

-- Enable realtime for messages (for live chat updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- ============================================================================
-- DONE!
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ DIRECT MESSAGES SCHEMA CREATED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables: conversations, messages, user_settings';
  RAISE NOTICE 'RLS policies and functions configured';
  RAISE NOTICE 'Realtime enabled for live messaging';
END $$;
