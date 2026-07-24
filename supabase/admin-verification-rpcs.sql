-- supabase/admin-verification-rpcs.sql
CREATE OR REPLACE FUNCTION public.admin_verify_user(target uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.user_verification
    SET verified_at = COALESCE(verified_at, now()),
        verified_channel = COALESCE(verified_channel, 'email')
  WHERE user_id = target;  -- restore trigger fires
  INSERT INTO public.verification_events(user_id, event_type, metadata)
  VALUES (target, 'AccountRestored', jsonb_build_object('by', auth.uid(), 'reason', reason, 'manual', true));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(target uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.user_verification
    SET account_status='active', suspended_at=NULL, suspension_reason=NULL WHERE user_id = target;
  INSERT INTO public.verification_events(user_id, event_type, metadata)
  VALUES (target, 'AccountRestored', jsonb_build_object('by', auth.uid(), 'reason', reason, 'manual', true));
END; $$;
