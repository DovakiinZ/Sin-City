-- ============================================================================
-- DMs ARE ARCHIVED, NEVER DELETED
-- Run this in the Supabase SQL Editor, after follow-requests-and-dm-gate.sql.
--
-- What this changes:
--   1. Nothing in a DM can be hard-deleted any more. Every DELETE policy on the
--      messaging tables is dropped and the DELETE privilege is revoked, so even
--      a bug or a hand-written client query cannot destroy history.
--   2. "Delete chat" becomes "archive chat": the chat leaves the active list for
--      the participant, and every message stays readable - including for the
--      other participant. Nothing is wiped.
--   3. "Delete message" becomes "archive message": the message is hidden from
--      participants but kept, flagged, and always visible to admins.
--   4. Chats previously marked 'deleted' are converted to 'archived', and the
--      messages that were wiped by that action are restored for participants.
--      Admins could always see them; now the participants can too.
-- Idempotent - safe to re-run.
-- ============================================================================

-- ============================================================================
-- 1. NO HARD DELETES ANYWHERE IN MESSAGING
-- ============================================================================
DO $$
DECLARE
  pol RECORD;
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'message_sessions', 'session_messages',
    'conversations', 'messages'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;

    -- Drop every DELETE policy, whatever it happens to be called.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND cmd = 'DELETE'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- And take the privilege away entirely. SECURITY DEFINER functions below
    -- still work; they run as the function owner.
    EXECUTE format('REVOKE DELETE ON public.%I FROM authenticated', tbl);
    EXECUTE format('REVOKE DELETE ON public.%I FROM anon', tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 2. ARCHIVE A CHAT (replaces deleting one)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.archive_session(p_session_id UUID)
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
    RAISE EXCEPTION 'Not allowed to archive this chat';
  END IF;

  -- Messages are deliberately left untouched: archiving a chat must never
  -- destroy or hide its contents for anyone.
  UPDATE public.message_sessions
  SET status = 'archived', archived_at = now()
  WHERE id = p_session_id
    AND status <> 'blocked';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_session(UUID) TO authenticated;

-- Bring an archived chat back to the active list.
CREATE OR REPLACE FUNCTION public.unarchive_session(p_session_id UUID)
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
    RAISE EXCEPTION 'Not allowed to restore this chat';
  END IF;

  UPDATE public.message_sessions
  SET status = 'active', archived_at = NULL
  WHERE id = p_session_id
    AND status IN ('archived', 'deleted');

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unarchive_session(UUID) TO authenticated;

-- Old clients still call soft_delete_session. Point it at the archive path so
-- it can no longer wipe a conversation's messages.
CREATE OR REPLACE FUNCTION public.soft_delete_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.archive_session(p_session_id);
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_session(UUID) TO authenticated;

-- ============================================================================
-- 3. ARCHIVE A SINGLE MESSAGE (hidden from participants, kept for admins)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.archive_message(p_message_id UUID)
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
    RAISE EXCEPTION 'Not allowed to archive this message';
  END IF;

  -- is_deleted is the pre-existing flag name; it means "archived - hidden from
  -- participants, retained and visible to admins".
  UPDATE public.session_messages
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_me
  WHERE id = p_message_id AND is_deleted = false;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_message(UUID) TO authenticated;

-- Admins can put an archived message back in front of the participants.
CREATE OR REPLACE FUNCTION public.unarchive_message(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_site_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.session_messages
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_message_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unarchive_message(UUID) TO authenticated;

-- Old clients still call soft_delete_message.
CREATE OR REPLACE FUNCTION public.soft_delete_message(p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.archive_message(p_message_id);
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_message(UUID) TO authenticated;

-- ============================================================================
-- 4. BACKFILL: 'deleted' chats become archived, their wiped messages come back
-- ============================================================================

-- soft_delete_session used to stamp the session's archived_at and every one of
-- its messages' deleted_at with the same transaction timestamp. That equality
-- identifies exactly the messages a chat-delete wiped, so only those are
-- restored - individually archived messages keep their flag.
UPDATE public.session_messages m
SET is_deleted = false,
    deleted_at = NULL,
    deleted_by = NULL
FROM public.message_sessions s
WHERE m.session_id = s.id
  AND s.status = 'deleted'
  AND m.is_deleted = true
  AND s.archived_at IS NOT NULL
  AND m.deleted_at = s.archived_at;

UPDATE public.message_sessions
SET status = 'archived'
WHERE status = 'deleted';

-- ============================================================================
-- 5. ADMIN SESSION LIST: include the archived-message count too
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_get_all_sessions();

CREATE FUNCTION public.admin_get_all_sessions()
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
-- DONE
-- ============================================================================
DO $$
DECLARE
  v_restored BIGINT;
  v_archived BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_archived FROM public.message_sessions WHERE status = 'archived';
  SELECT COUNT(*) INTO v_restored FROM public.session_messages WHERE is_deleted = true;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'DM ARCHIVE-ONLY MODE INSTALLED';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Hard deletes are revoked on all messaging tables.';
  RAISE NOTICE 'Archived chats: %', v_archived;
  RAISE NOTICE 'Messages still flagged archived (admin-visible): %', v_restored;
END $$;
