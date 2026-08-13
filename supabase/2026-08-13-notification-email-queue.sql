-- ============================================================================
-- UNIFIED EMAIL NOTIFICATIONS: settings + queue + enqueue trigger
-- Replaces the half-built dm_email_queue path. Idempotent; safe to re-run.
-- ============================================================================

-- 1. SETTINGS ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_email_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled     BOOLEAN NOT NULL DEFAULT true,
  delay_minutes     INTEGER NOT NULL DEFAULT 5 CHECK (delay_minutes IN (5, 15, 30, 60)),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_email_settings_token
  ON public.notification_email_settings(unsubscribe_token);

ALTER TABLE public.notification_email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own email settings select" ON public.notification_email_settings;
CREATE POLICY "own email settings select" ON public.notification_email_settings
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own email settings insert" ON public.notification_email_settings;
CREATE POLICY "own email settings insert" ON public.notification_email_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own email settings update" ON public.notification_email_settings;
CREATE POLICY "own email settings update" ON public.notification_email_settings
  FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_email_settings TO authenticated;

-- Migrate any existing DM settings, then the old table is dropped in section 5.
DO $$
BEGIN
  IF to_regclass('public.dm_notification_settings') IS NOT NULL THEN
    INSERT INTO public.notification_email_settings (user_id, email_enabled, delay_minutes)
    SELECT user_id, email_enabled, delay_minutes FROM public.dm_notification_settings
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- Ensure-and-read helper. Guarantees every user who gets a notification has a
-- settings row (hence an unsubscribe_token) by the time an email is scheduled.
CREATE OR REPLACE FUNCTION public.get_notification_email_settings(p_user_id UUID)
RETURNS TABLE (email_enabled BOOLEAN, delay_minutes INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_email_settings (user_id)
  VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  RETURN QUERY
  SELECT s.email_enabled, s.delay_minutes
  FROM public.notification_email_settings s WHERE s.user_id = p_user_id;
END; $$;

-- 2. QUEUE ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_email_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one pending email per user -> coalescing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_email_queue_pending
  ON public.notification_email_queue(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notif_email_queue_due
  ON public.notification_email_queue(scheduled_at) WHERE status = 'pending';

ALTER TABLE public.notification_email_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service manages email queue" ON public.notification_email_queue;
CREATE POLICY "service manages email queue" ON public.notification_email_queue
  FOR ALL USING (auth.role() = 'service_role');

-- 3. ENQUEUE TRIGGER --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings RECORD;
  v_scheduled TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_settings FROM public.get_notification_email_settings(NEW.user_id);
  IF NOT v_settings.email_enabled THEN
    RETURN NEW;
  END IF;
  v_scheduled := now() + (v_settings.delay_minutes || ' minutes')::interval;
  INSERT INTO public.notification_email_queue (user_id, scheduled_at)
  VALUES (NEW.user_id, v_scheduled)
  ON CONFLICT (user_id) WHERE status = 'pending' DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_notification_enqueue_email ON public.notifications;
CREATE TRIGGER on_notification_enqueue_email
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_email();

-- 4. RETIRE the half-built DM email path -----------------------------------
DROP TRIGGER IF EXISTS on_new_dm_queue_email ON public.session_messages;
DROP TRIGGER IF EXISTS on_read_cancel_email ON public.session_read_status;
DROP FUNCTION IF EXISTS public.trigger_queue_dm_notification() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_cancel_dm_emails() CASCADE;
DROP FUNCTION IF EXISTS public.queue_dm_notification(UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_pending_dm_emails(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_notification_settings(UUID);
DROP TABLE IF EXISTS public.dm_email_queue;

-- 5. Drop old settings table AFTER migration above.
DROP TABLE IF EXISTS public.dm_notification_settings;

DO $$ BEGIN RAISE NOTICE '✅ notification_email_settings + notification_email_queue installed'; END $$;
