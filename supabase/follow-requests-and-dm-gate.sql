-- ============================================================================
-- FOLLOW REQUESTS + DM GATE + SOFT-DELETED MESSAGES (ADMIN VISIBLE)
-- Run this in Supabase SQL Editor.
--
-- What this changes:
--   1. follows.status ('pending' | 'accepted'). New follows start as a REQUEST.
--      Existing follows are grandfathered in as 'accepted'.
--   2. Only the person being followed can approve; either side can remove.
--   3. A DM session can only be created / written to when an ACCEPTED follow
--      exists in EITHER direction between the two users.
--   4. Message deletion is now a SOFT delete. Participants stop seeing the
--      message; admins keep seeing it, flagged as deleted.
-- Idempotent - safe to re-run.
-- ============================================================================

-- ============================================================================
-- 1. FOLLOWS: add request status
-- ============================================================================

-- NOTE: DEFAULT 'accepted' here is deliberate - it backfills every pre-existing
-- follow row as already approved. The default flips to 'pending' immediately
-- after, so all NEW follows are requests.
ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted';

ALTER TABLE public.follows
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

UPDATE public.follows SET status = 'accepted' WHERE status IS NULL;

ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_status_check;
ALTER TABLE public.follows
  ADD CONSTRAINT follows_status_check CHECK (status IN ('pending', 'accepted'));

-- From now on, a follow is a request until approved.
ALTER TABLE public.follows ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_follows_status ON public.follows(status);
CREATE INDEX IF NOT EXISTS idx_follows_pending_incoming
  ON public.follows(following_id) WHERE status = 'pending';

-- ============================================================================
-- 2. FOLLOWS: policies
-- ============================================================================

-- Requester may only ever insert a PENDING row for themselves.
DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can request to follow"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id AND status = 'pending');

-- Only the target of the request can approve it.
DROP POLICY IF EXISTS "Users can approve follow requests" ON public.follows;
CREATE POLICY "Users can approve follow requests"
  ON public.follows FOR UPDATE
  TO authenticated
  USING (auth.uid() = following_id)
  WITH CHECK (auth.uid() = following_id AND status = 'accepted');

-- Requester can cancel/unfollow; target can reject a request or remove a follower.
DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
CREATE POLICY "Users can unfollow or remove a follower"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- ============================================================================
-- 3. HELPERS
-- ============================================================================

-- is_following now means "following, and approved".
CREATE OR REPLACE FUNCTION public.is_following(follower_uuid UUID, following_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = follower_uuid
      AND following_id = following_uuid
      AND status = 'accepted'
  );
$$;

-- Counts should only reflect approved follows.
CREATE OR REPLACE FUNCTION public.get_follower_count(user_uuid UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) FROM public.follows
  WHERE following_id = user_uuid AND status = 'accepted';
$$;

CREATE OR REPLACE FUNCTION public.get_following_count(user_uuid UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) FROM public.follows
  WHERE follower_id = user_uuid AND status = 'accepted';
$$;

-- The DM gate: an approved follow in EITHER direction unlocks the conversation.
CREATE OR REPLACE FUNCTION public.dm_allowed(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows f
    WHERE f.status = 'accepted'
      AND (
        (f.follower_id = p_user_a AND f.following_id = p_user_b)
        OR (f.follower_id = p_user_b AND f.following_id = p_user_a)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_site_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.dm_allowed(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_admin(UUID) TO authenticated;

-- ============================================================================
-- 4. FOLLOW REQUEST ACTIONS (RPCs - keep notification side effects server-side)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.respond_to_follow_request(
  p_follower_id UUID,
  p_approve BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_my_username TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = p_follower_id AND following_id = v_me
  ) THEN
    RETURN false;
  END IF;

  IF p_approve THEN
    UPDATE public.follows
    SET status = 'accepted', responded_at = now()
    WHERE follower_id = p_follower_id AND following_id = v_me;

    SELECT username INTO v_my_username FROM public.profiles WHERE id = v_me;

    INSERT INTO public.notifications (user_id, type, content, read)
    VALUES (
      p_follower_id,
      'follow_approved',
      jsonb_build_object(
        'approver', COALESCE(v_my_username, 'Someone'),
        'approverId', v_me,
        'approverUsername', v_my_username
      ),
      false
    );
  ELSE
    -- Rejecting a request (or removing an existing follower) deletes the row.
    DELETE FROM public.follows
    WHERE follower_id = p_follower_id AND following_id = v_me;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_follow_request(UUID, BOOLEAN) TO authenticated;

-- Pending incoming requests for the current user.
CREATE OR REPLACE FUNCTION public.get_pending_follow_requests()
RETURNS TABLE (
  follower_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  requested_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.follower_id, p.username, p.display_name, p.avatar_url, f.created_at
  FROM public.follows f
  JOIN public.profiles p ON p.id = f.follower_id
  WHERE f.following_id = auth.uid() AND f.status = 'pending'
  ORDER BY f.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_follow_requests() TO authenticated;

-- Everyone the current user is allowed to DM (approved follow, either direction).
CREATE OR REPLACE FUNCTION public.get_dm_eligible_users()
RETURNS TABLE (
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.username, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.status = 'accepted'
        AND (
          (f.follower_id = auth.uid() AND f.following_id = p.id)
          OR (f.follower_id = p.id AND f.following_id = auth.uid())
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_dm_eligible_users() TO authenticated;

-- ============================================================================
-- 5. NOTIFICATIONS: allow the new types
-- ============================================================================
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'comment', 'reaction', 'like', 'follow', 'mention', 'reply',
    'message', 'dm', 'dm_message', 'follow_request', 'follow_approved'
  ));

-- ============================================================================
-- 6. DM GATE ON SESSIONS
-- ============================================================================

-- Sessions can now also be soft-deleted by a participant.
ALTER TABLE public.message_sessions DROP CONSTRAINT IF EXISTS message_sessions_status_check;
ALTER TABLE public.message_sessions
  ADD CONSTRAINT message_sessions_status_check
  CHECK (status IN ('active', 'archived', 'blocked', 'deleted'));

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

  -- The gate: an approved follow must exist in one direction or the other.
  IF NOT public.dm_allowed(v_current_user, p_other_user_id) THEN
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
  ELSIF v_status = 'blocked' THEN
    RAISE EXCEPTION 'BLOCKED: This conversation is blocked.'
      USING ERRCODE = 'check_violation';
  ELSIF v_status IN ('archived', 'deleted') THEN
    UPDATE public.message_sessions
    SET status = 'active', last_activity_at = now(), archived_at = NULL
    WHERE id = v_session_id;
  END IF;

  RETURN v_session_id;
END;
$$;

-- Sessions may only be created between users with an approved follow.
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON public.message_sessions;
CREATE POLICY "Authenticated users can create sessions"
  ON public.message_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = participant_1 OR auth.uid() = participant_2)
    AND public.dm_allowed(participant_1, participant_2)
  );

-- Admins can see every session (inline moderation in /chat).
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.message_sessions;
CREATE POLICY "Users can view their own sessions"
  ON public.message_sessions FOR SELECT
  USING (
    auth.uid() = participant_1
    OR auth.uid() = participant_2
    OR public.is_site_admin(auth.uid())
  );

-- No more hard-deleting sessions - history must survive for admin review.
DROP POLICY IF EXISTS "Users can delete their own sessions" ON public.message_sessions;

-- ============================================================================
-- 7. DM GATE ON MESSAGES + SOFT DELETE
-- ============================================================================

-- is_deleted may already exist as a NULLABLE column from messaging-schema.sql.
-- ADD COLUMN IF NOT EXISTS would no-op and leave NULLs behind, and a NULL makes
-- the "is_deleted = false" policy below evaluate to NULL - which would hide the
-- message from its own participants. Normalise, then enforce NOT NULL.
ALTER TABLE public.session_messages
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN;
UPDATE public.session_messages SET is_deleted = false WHERE is_deleted IS NULL;
ALTER TABLE public.session_messages ALTER COLUMN is_deleted SET DEFAULT false;
ALTER TABLE public.session_messages ALTER COLUMN is_deleted SET NOT NULL;

ALTER TABLE public.session_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.session_messages
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_deleted
  ON public.session_messages(session_id) WHERE is_deleted = true;

-- Participants see live messages only. Admins see everything, deleted included.
DROP POLICY IF EXISTS "Users can view messages in their sessions" ON public.session_messages;
CREATE POLICY "Users can view messages in their sessions"
  ON public.session_messages FOR SELECT
  USING (
    public.is_site_admin(auth.uid())
    OR (
      is_deleted = false
      AND EXISTS (
        SELECT 1 FROM public.message_sessions s
        WHERE s.id = session_id
          AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
      )
    )
  );

-- Sending requires an active session AND a still-approved follow.
DROP POLICY IF EXISTS "Users can send messages to their sessions" ON public.session_messages;
CREATE POLICY "Users can send messages to their sessions"
  ON public.session_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
        AND s.status = 'active'
        AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
        AND public.dm_allowed(s.participant_1, s.participant_2)
    )
  );

-- Direct UPDATEs stay available for read receipts, but cannot flip is_deleted.
-- (Deletion goes through soft_delete_message, which is SECURITY DEFINER.)
DROP POLICY IF EXISTS "Users can update read status" ON public.session_messages;
CREATE POLICY "Users can update read status"
  ON public.session_messages FOR UPDATE
  TO authenticated
  USING (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
        AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  )
  WITH CHECK (
    is_deleted = false
    AND EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
        AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

-- Remove every hard-delete path so nothing is lost to the admin.
DROP POLICY IF EXISTS "Users can delete messages from their sessions" ON public.session_messages;
DROP POLICY IF EXISTS "Admins can delete any message" ON public.session_messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON public.session_messages;

CREATE OR REPLACE FUNCTION public.soft_delete_message(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_sender UUID;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT sender_id INTO v_sender
  FROM public.session_messages
  WHERE id = p_message_id;

  IF v_sender IS NULL THEN
    RETURN false;
  END IF;

  IF v_sender <> v_me AND NOT public.is_site_admin(v_me) THEN
    RAISE EXCEPTION 'Not allowed to delete this message';
  END IF;

  UPDATE public.session_messages
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_me
  WHERE id = p_message_id AND is_deleted = false;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_message(UUID) TO authenticated;

-- Deleting a chat soft-deletes its messages and hides the session from both
-- participants. Admins still see the session and every message in it.
CREATE OR REPLACE FUNCTION public.soft_delete_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.message_sessions
    WHERE id = p_session_id
      AND (participant_1 = v_me OR participant_2 = v_me OR public.is_site_admin(v_me))
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this chat';
  END IF;

  UPDATE public.session_messages
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_me
  WHERE session_id = p_session_id AND is_deleted = false;

  UPDATE public.message_sessions
  SET status = 'deleted', archived_at = now()
  WHERE id = p_session_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_session(UUID) TO authenticated;

-- ============================================================================
-- 8. ADMIN: full session list with deleted-message counts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_all_sessions()
RETURNS TABLE (
  session_id UUID,
  participant_1_id UUID,
  participant_1_username TEXT,
  participant_1_avatar TEXT,
  participant_2_id UUID,
  participant_2_username TEXT,
  participant_2_avatar TEXT,
  status TEXT,
  message_count INTEGER,
  deleted_message_count BIGINT,
  last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_site_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.participant_1,
    p1.username,
    p1.avatar_url,
    s.participant_2,
    p2.username,
    p2.avatar_url,
    s.status,
    s.message_count,
    (SELECT COUNT(*) FROM public.session_messages m
      WHERE m.session_id = s.id AND m.is_deleted = true),
    s.last_activity_at
  FROM public.message_sessions s
  LEFT JOIN public.profiles p1 ON p1.id = s.participant_1
  LEFT JOIN public.profiles p2 ON p2.id = s.participant_2
  ORDER BY s.last_activity_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_sessions() TO authenticated;

-- ============================================================================
-- 9. UNREAD COUNTS MUST IGNORE SOFT-DELETED MESSAGES
--    (otherwise a deleted message leaves a badge the user can never clear)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_global_unread_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unread_count INTEGER := 0;
  v_current_user UUID := auth.uid();
BEGIN
  IF v_current_user IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(unread_per_session), 0)::INTEGER
  INTO v_unread_count
  FROM (
    SELECT
      s.id AS session_id,
      COUNT(m.id) AS unread_per_session
    FROM public.message_sessions s
    LEFT JOIN public.session_messages m
      ON m.session_id = s.id
      AND m.sender_id != v_current_user
      AND m.is_deleted = false
    LEFT JOIN public.session_read_status srs
      ON srs.session_id = s.id
      AND srs.user_id = v_current_user
    WHERE
      (s.participant_1 = v_current_user OR s.participant_2 = v_current_user)
      AND s.status = 'active'
      AND m.id IS NOT NULL
      AND (
        srs.last_read_at IS NULL
        OR m.created_at > srs.last_read_at
      )
    GROUP BY s.id
  ) AS session_counts;

  RETURN v_unread_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_unread_count(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unread_count INTEGER := 0;
  v_current_user UUID := auth.uid();
  v_last_read_at TIMESTAMPTZ;
BEGIN
  IF v_current_user IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.message_sessions
    WHERE id = p_session_id
      AND (participant_1 = v_current_user OR participant_2 = v_current_user)
  ) THEN
    RETURN 0;
  END IF;

  SELECT last_read_at INTO v_last_read_at
  FROM public.session_read_status
  WHERE session_id = p_session_id
    AND user_id = v_current_user;

  SELECT COUNT(*)::INTEGER INTO v_unread_count
  FROM public.session_messages
  WHERE session_id = p_session_id
    AND sender_id != v_current_user
    AND is_deleted = false
    AND (v_last_read_at IS NULL OR created_at > v_last_read_at);

  RETURN v_unread_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_unread_count(UUID) TO authenticated;

-- ============================================================================
-- DONE
-- ============================================================================
DO $$
DECLARE
  v_accepted BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_accepted FROM public.follows WHERE status = 'accepted';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ FOLLOW REQUESTS + DM GATE INSTALLED';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Grandfathered accepted follows: %', v_accepted;
  RAISE NOTICE 'New follows now start as pending requests.';
  RAISE NOTICE 'DMs require an approved follow in either direction.';
  RAISE NOTICE 'Message deletion is now soft; admins see deleted messages.';
END $$;
