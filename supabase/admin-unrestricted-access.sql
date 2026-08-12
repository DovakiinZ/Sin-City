-- ============================================================================
-- ADMIN UNRESTRICTED ACCESS (DM GATE BYPASS)
-- Run this in the Supabase SQL Editor, after follow-requests-and-dm-gate.sql.
--
-- What this changes:
--   Site admins are no longer subject to the "approved follow required" gate.
--   An admin can open a DM with any user and send messages in that DM without
--   a follow request. Everyone else is unchanged: still gated both ways.
-- Idempotent - safe to re-run.
-- ============================================================================

-- The gate itself, now with an admin exemption. Either participant being an
-- admin unlocks the conversation, so an admin-opened DM stays writable for the
-- user on the other side too.
CREATE OR REPLACE FUNCTION public.dm_allowed(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_site_admin(p_user_a)
    OR public.is_site_admin(p_user_b)
    OR EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.status = 'accepted'
        AND (
          (f.follower_id = p_user_a AND f.following_id = p_user_b)
          OR (f.follower_id = p_user_b AND f.following_id = p_user_a)
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.dm_allowed(UUID, UUID) TO authenticated;

-- get_or_create_session already calls dm_allowed, so it inherits the exemption.
-- Recreated here only to make the admin path explicit in the error path.
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
  v_status TEXT;
BEGIN
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_current_user = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;

  -- Admins bypass the gate; everyone else needs an approved follow.
  IF NOT public.is_site_admin(v_current_user)
     AND NOT public.dm_allowed(v_current_user, p_other_user_id) THEN
    RAISE EXCEPTION 'FOLLOW_REQUIRED: You can only message people once a follow request between you has been approved.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_current_user < p_other_user_id THEN
    v_user_1 := v_current_user;
    v_user_2 := p_other_user_id;
  ELSE
    v_user_1 := p_other_user_id;
    v_user_2 := v_current_user;
  END IF;

  SELECT id, status INTO v_session_id, v_status
  FROM public.message_sessions
  WHERE participant_1 = v_user_1 AND participant_2 = v_user_2;

  IF v_session_id IS NULL THEN
    INSERT INTO public.message_sessions (participant_1, participant_2)
    VALUES (v_user_1, v_user_2)
    RETURNING id INTO v_session_id;
  ELSIF v_status = 'blocked' AND NOT public.is_site_admin(v_current_user) THEN
    RAISE EXCEPTION 'BLOCKED: This conversation is blocked.'
      USING ERRCODE = 'check_violation';
  ELSIF v_status IN ('archived', 'deleted', 'blocked') THEN
    UPDATE public.message_sessions
    SET status = 'active', last_activity_at = now(), archived_at = NULL
    WHERE id = v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$;

-- Session creation: admins may open a session with anyone.
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON public.message_sessions;
CREATE POLICY "Authenticated users can create sessions"
  ON public.message_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = participant_1 OR auth.uid() = participant_2)
    AND (
      public.is_site_admin(auth.uid())
      OR public.dm_allowed(participant_1, participant_2)
    )
  );

-- Sending: an admin can write to any session they participate in, and can also
-- post into any session for moderation purposes.
DROP POLICY IF EXISTS "Users can send messages to their sessions" ON public.session_messages;
CREATE POLICY "Users can send messages to their sessions"
  ON public.session_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      public.is_site_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.message_sessions s
        WHERE s.id = session_id
          AND s.status = 'active'
          AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
          AND public.dm_allowed(s.participant_1, s.participant_2)
      )
    )
  );

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ADMIN UNRESTRICTED ACCESS INSTALLED';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Admins can DM any user without a follow approval.';
  RAISE NOTICE 'Non-admin DMs are still gated on an approved follow.';
END $$;
