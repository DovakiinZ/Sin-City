-- ============================================================================
-- DM EMAIL NOTIFICATIONS SYSTEM
-- Twitter-like delayed email notifications with smart spam prevention
-- ============================================================================

-- ============================================================================
-- 1. NOTIFICATION SETTINGS TABLE
-- User preferences for DM email notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dm_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  delay_minutes INTEGER DEFAULT 5 CHECK (delay_minutes IN (5, 15, 30, 60)),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dm_notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own notification settings"
  ON public.dm_notification_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification settings"
  ON public.dm_notification_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings"
  ON public.dm_notification_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 2. EMAIL QUEUE TABLE
-- Scheduled emails waiting to be sent
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dm_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES public.message_sessions(id) ON DELETE CASCADE NOT NULL,
  last_message_id UUID REFERENCES public.session_messages(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create partial unique index (only for pending emails)
-- This ensures max one pending email per user per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_email_queue_unique_pending 
  ON public.dm_email_queue(user_id, session_id) 
  WHERE status = 'pending';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dm_email_queue_user ON public.dm_email_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_email_queue_session ON public.dm_email_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_dm_email_queue_scheduled ON public.dm_email_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dm_email_queue_status ON public.dm_email_queue(status);

-- Enable RLS
ALTER TABLE public.dm_email_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies (restrictive - backend only)
CREATE POLICY "Service role can manage email queue"
  ON public.dm_email_queue FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. HELPER FUNCTIONS
-- ============================================================================

-- Check if user is offline (no activity in last 5 minutes)
CREATE OR REPLACE FUNCTION public.is_user_offline(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- User is offline if they haven't updated read status in 5 minutes
  RETURN NOT EXISTS (
    SELECT 1 FROM public.session_read_status
    WHERE user_id = p_user_id
    AND last_read_at > now() - INTERVAL '5 minutes'
  );
END;
$$;

-- Get or create notification settings for user
CREATE OR REPLACE FUNCTION public.get_notification_settings(p_user_id UUID)
RETURNS TABLE (
  email_enabled BOOLEAN,
  delay_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert default settings if not exists
  INSERT INTO public.dm_notification_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Return settings
  RETURN QUERY
  SELECT ns.email_enabled, ns.delay_minutes
  FROM public.dm_notification_settings ns
  WHERE ns.user_id = p_user_id;
END;
$$;

-- Queue or update a DM notification email
CREATE OR REPLACE FUNCTION public.queue_dm_notification(
  p_user_id UUID,
  p_session_id UUID,
  p_message_id UUID,
  p_sender_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_is_offline BOOLEAN;
  v_scheduled_at TIMESTAMPTZ;
BEGIN
  -- Get user notification settings
  SELECT * INTO v_settings
  FROM public.get_notification_settings(p_user_id);
  
  -- Exit if email notifications disabled
  IF NOT v_settings.email_enabled THEN
    RETURN;
  END IF;
  
  -- Check if user is offline
  v_is_offline := public.is_user_offline(p_user_id);
  
  -- Exit if user is online
  IF NOT v_is_offline THEN
    RETURN;
  END IF;
  
  -- Calculate scheduled time
  v_scheduled_at := now() + (v_settings.delay_minutes || ' minutes')::INTERVAL;
  
  -- Upsert into email queue
  INSERT INTO public.dm_email_queue (
    user_id,
    session_id,
    last_message_id,
    sender_id,
    scheduled_at,
    status
  )
  VALUES (
    p_user_id,
    p_session_id,
    p_message_id,
    p_sender_id,
    v_scheduled_at,
    'pending'
  )
  ON CONFLICT (user_id, session_id) 
    WHERE status = 'pending'
  DO UPDATE SET
    last_message_id = p_message_id,
    sender_id = p_sender_id,
    scheduled_at = v_scheduled_at;
END;
$$;

-- Cancel pending email notifications for a session
CREATE OR REPLACE FUNCTION public.cancel_pending_dm_emails(
  p_user_id UUID,
  p_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dm_email_queue
  SET 
    status = 'cancelled',
    cancelled_at = now()
  WHERE 
    user_id = p_user_id
    AND session_id = p_session_id
    AND status = 'pending';
END;
$$;

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

-- Trigger: Queue email notification on new message
CREATE OR REPLACE FUNCTION public.trigger_queue_dm_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id UUID;
BEGIN
  -- Get the recipient (the other participant)
  SELECT 
    CASE 
      WHEN s.participant_1 = NEW.sender_id THEN s.participant_2
      ELSE s.participant_1
    END INTO v_recipient_id
  FROM public.message_sessions s
  WHERE s.id = NEW.session_id;
  
  -- Don't send notification if recipient doesn't exist
  IF v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Queue the notification
  PERFORM public.queue_dm_notification(
    v_recipient_id,
    NEW.session_id,
    NEW.id,
    NEW.sender_id
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on new messages
DROP TRIGGER IF EXISTS on_new_dm_queue_email ON public.session_messages;
CREATE TRIGGER on_new_dm_queue_email
  AFTER INSERT ON public.session_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_queue_dm_notification();

-- Trigger: Cancel pending emails when user reads messages
CREATE OR REPLACE FUNCTION public.trigger_cancel_dm_emails()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cancel any pending emails for this session
  PERFORM public.cancel_pending_dm_emails(NEW.user_id, NEW.session_id);
  
  RETURN NEW;
END;
$$;

-- Create trigger on read status updates
DROP TRIGGER IF EXISTS on_read_cancel_email ON public.session_read_status;
CREATE TRIGGER on_read_cancel_email
  AFTER INSERT OR UPDATE ON public.session_read_status
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_cancel_dm_emails();

-- ============================================================================
-- 5. GRANT PERMISSIONS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE ON public.dm_notification_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_notification_settings(UUID) TO authenticated;

-- ============================================================================
-- 6. ENABLE REALTIME (for settings updates)
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_notification_settings;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ DM EMAIL NOTIFICATIONS INSTALLED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables:';
  RAISE NOTICE '  - dm_notification_settings (user preferences)';
  RAISE NOTICE '  - dm_email_queue (scheduled emails)';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions:';
  RAISE NOTICE '  - is_user_offline(user_id)';
  RAISE NOTICE '  - queue_dm_notification(...)';
  RAISE NOTICE '  - cancel_pending_dm_emails(...)';
  RAISE NOTICE '';
  RAISE NOTICE 'Triggers:';
  RAISE NOTICE '  - on_new_dm_queue_email (queues email on new message)';
  RAISE NOTICE '  - on_read_cancel_email (cancels email when read)';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Deploy Supabase Edge Function for email processing';
END $$;
