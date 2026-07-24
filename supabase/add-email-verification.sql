-- supabase/add-email-verification.sql — idempotent.

CREATE TABLE IF NOT EXISTS public.verification_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  launch_date timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.verification_config (id, launch_date)
VALUES (true, now()) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_verification (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  verification_deadline timestamptz NOT NULL,
  verified_at timestamptz,
  verified_channel text CHECK (verified_channel IN ('email','phone')),
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active','verification_overdue','suspended')),
  reminders_sent int NOT NULL DEFAULT 0,
  last_reminder_sent_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  otp_hash text,
  otp_expires_at timestamptz,
  otp_attempts int NOT NULL DEFAULT 0,
  otp_channel text CHECK (otp_channel IN ('email','phone')),
  last_sent_at timestamptz,
  send_count int NOT NULL DEFAULT 0,
  send_window_start timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_verification_status ON public.user_verification(account_status);
CREATE INDEX IF NOT EXISTS idx_user_verification_deadline ON public.user_verification(verification_deadline);
CREATE INDEX IF NOT EXISTS idx_user_verification_otp ON public.user_verification(otp_hash);

CREATE TABLE IF NOT EXISTS public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'VerificationOtpSent','VerificationReminderSent','VerificationDeadlineExpired',
    'AccountRestricted','EmailVerified','AccountRestored','EmailChanged','ProbeCleanup'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_events_user ON public.verification_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_rate_limits (
  ip_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0
);
ALTER TABLE public.verification_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) may access this table.

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.account_can_write()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT uv.account_status = 'active' FROM public.user_verification uv WHERE uv.user_id = auth.uid()),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.compute_verification_deadline(created timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT GREATEST(created, (SELECT launch_date FROM public.verification_config WHERE id)) + interval '5 days';
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_verification (user_id, email, phone, verification_deadline)
  VALUES (NEW.id, NEW.email, NEW.phone, public.compute_verification_deadline(NEW.created_at))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created_verification ON auth.users;
CREATE TRIGGER on_auth_user_created_verification
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_verification();

CREATE OR REPLACE FUNCTION public.restore_on_verify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL THEN
    NEW.account_status := 'active';
    NEW.suspended_at := NULL; NEW.suspension_reason := NULL;
    NEW.otp_hash := NULL; NEW.otp_expires_at := NULL; NEW.otp_attempts := 0;
    INSERT INTO public.verification_events(user_id, event_type, metadata)
    VALUES (NEW.user_id, 'EmailVerified', jsonb_build_object('channel', NEW.verified_channel)),
           (NEW.user_id, 'AccountRestored', jsonb_build_object('auto', true));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_restore_on_verify ON public.user_verification;
CREATE TRIGGER trg_restore_on_verify
  BEFORE UPDATE ON public.user_verification FOR EACH ROW EXECUTE FUNCTION public.restore_on_verify();

-- Grandfather existing users.
INSERT INTO public.user_verification (user_id, email, phone, verification_deadline)
SELECT u.id, u.email, u.phone, public.compute_verification_deadline(u.created_at)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_verification v WHERE v.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_verification ENABLE ROW LEVEL SECURITY;
-- Read-only for clients; ALL writes go through the service role / SECURITY DEFINER functions (no client INSERT/UPDATE/DELETE policy by design).
DROP POLICY IF EXISTS "own verification readable" ON public.user_verification;
CREATE POLICY "own verification readable" ON public.user_verification
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read verification events" ON public.verification_events;
CREATE POLICY "admins read verification events" ON public.verification_events
  FOR SELECT USING (public.is_admin(auth.uid()));
