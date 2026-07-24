-- Start the 5-day verification clock only when a user actually logs in.
-- Dormant/inactive users who never sign in keep a NULL deadline and are never enforced
-- (the cron skips NULL-deadline rows; restriction uses `verification_deadline < now()`,
--  which is never true for NULL). New registrants still get a deadline at signup because
-- registration creates an active session.
-- Idempotent: safe to re-run.

-- 0) Deadline is now optional (NULL = not started / inactive user).
ALTER TABLE public.user_verification ALTER COLUMN verification_deadline DROP NOT NULL;

-- 1) Allow a dedicated audit event type.
ALTER TABLE public.verification_events DROP CONSTRAINT IF EXISTS verification_events_event_type_check;
ALTER TABLE public.verification_events ADD CONSTRAINT verification_events_event_type_check
  CHECK (event_type IN ('VerificationOtpSent','VerificationReminderSent','VerificationDeadlineExpired',
    'AccountRestricted','EmailVerified','AccountRestored','EmailChanged','ProbeCleanup',
    'DeadlineExtended','DeadlineStarted'));

-- 2) Login trigger: when auth.users.last_sign_in_at changes, start the clock for a
--    still-unverified, not-yet-started account. Never blocks the login itself.
CREATE OR REPLACE FUNCTION public.start_deadline_on_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at AND NEW.last_sign_in_at IS NOT NULL THEN
    UPDATE public.user_verification
      SET verification_deadline = now() + interval '5 days'
      WHERE user_id = NEW.id
        AND verification_deadline IS NULL
        AND verified_at IS NULL
        AND account_status = 'active';
    IF FOUND THEN
      INSERT INTO public.verification_events(user_id, event_type, metadata)
      VALUES (NEW.id, 'DeadlineStarted', jsonb_build_object('trigger','login'));
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- verification bookkeeping must never block a login
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.start_deadline_on_login();

-- 3) Backfill: existing users who have NEVER logged in and are unverified become exempt
--    (NULL deadline) until they log in. Users who have already signed in keep their deadline.
UPDATE public.user_verification uv
  SET verification_deadline = NULL
  FROM auth.users u
  WHERE u.id = uv.user_id
    AND uv.verified_at IS NULL
    AND u.last_sign_in_at IS NULL;
