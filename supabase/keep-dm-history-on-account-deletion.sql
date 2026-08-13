-- ============================================================================
-- DM HISTORY SURVIVES ACCOUNT DELETION
-- Run this in the Supabase SQL Editor, after dm-archive-only.sql.
--
-- Before this, message_sessions.participant_1/2 and session_messages.sender_id
-- were "REFERENCES auth.users(id) ON DELETE CASCADE", so deleting an auth user
-- (from the Supabase dashboard, or via the admin API) silently destroyed every
-- chat and message they were part of - including the other person's copy.
--
-- After this:
--   * Those foreign keys are ON DELETE SET NULL, so the rows stay.
--   * Each message and session carries a username snapshot taken at insert time
--     (and backfilled here), so a chat with a deleted account still reads
--     "@theirname" instead of "Unknown".
--   * Nothing in a DM is destroyed by deleting an account.
-- Idempotent - safe to re-run.
-- ============================================================================

-- ============================================================================
-- 1. USERNAME SNAPSHOTS (so history stays readable after the profile is gone)
-- ============================================================================
ALTER TABLE public.message_sessions
  ADD COLUMN IF NOT EXISTS participant_1_username TEXT,
  ADD COLUMN IF NOT EXISTS participant_2_username TEXT;

ALTER TABLE public.session_messages
  ADD COLUMN IF NOT EXISTS sender_username TEXT;

-- Backfill from the profiles that still exist.
UPDATE public.message_sessions s
SET participant_1_username = COALESCE(s.participant_1_username, p.username)
FROM public.profiles p
WHERE p.id = s.participant_1 AND s.participant_1_username IS NULL;

UPDATE public.message_sessions s
SET participant_2_username = COALESCE(s.participant_2_username, p.username)
FROM public.profiles p
WHERE p.id = s.participant_2 AND s.participant_2_username IS NULL;

UPDATE public.session_messages m
SET sender_username = p.username
FROM public.profiles p
WHERE p.id = m.sender_id AND m.sender_username IS NULL;

-- Keep the snapshots current for new rows.
CREATE OR REPLACE FUNCTION public.snapshot_session_usernames()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.participant_1_username IS NULL THEN
    SELECT username INTO NEW.participant_1_username
    FROM public.profiles WHERE id = NEW.participant_1;
  END IF;

  IF NEW.participant_2_username IS NULL THEN
    SELECT username INTO NEW.participant_2_username
    FROM public.profiles WHERE id = NEW.participant_2;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_session_snapshot_usernames ON public.message_sessions;
CREATE TRIGGER on_session_snapshot_usernames
  BEFORE INSERT ON public.message_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_session_usernames();

CREATE OR REPLACE FUNCTION public.snapshot_message_username()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_username IS NULL THEN
    SELECT username INTO NEW.sender_username
    FROM public.profiles WHERE id = NEW.sender_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_snapshot_username ON public.session_messages;
CREATE TRIGGER on_message_snapshot_username
  BEFORE INSERT ON public.session_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_message_username();

-- ============================================================================
-- 2. FOREIGN KEYS: SET NULL INSTEAD OF CASCADE
-- ============================================================================

-- The columns have to accept NULL for SET NULL to be legal.
ALTER TABLE public.message_sessions ALTER COLUMN participant_1 DROP NOT NULL;
ALTER TABLE public.message_sessions ALTER COLUMN participant_2 DROP NOT NULL;
ALTER TABLE public.session_messages ALTER COLUMN sender_id DROP NOT NULL;

-- Rebuild every FK that points at auth.users from these columns, whatever the
-- constraint happens to be named in this database.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.conrelid IN (
        'public.message_sessions'::regclass,
        'public.session_messages'::regclass
      )
      AND a.attname IN ('participant_1', 'participant_2', 'sender_id')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', con.tbl, con.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I)
         REFERENCES auth.users(id) ON DELETE SET NULL',
      con.tbl, con.conname, con.col
    );
    RAISE NOTICE 'Rebuilt % on %.% as ON DELETE SET NULL', con.conname, con.tbl, con.col;
  END LOOP;
END $$;

-- The legacy conversations/messages tables get the same treatment if present.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname, c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND ns.nspname = 'public'
      AND rel.relname IN ('conversations', 'messages')
      AND a.attname IN ('participant_1', 'participant_2', 'sender_id')
  LOOP
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', con.tbl, con.col);
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', con.tbl, con.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I)
         REFERENCES auth.users(id) ON DELETE SET NULL',
      con.tbl, con.conname, con.col
    );
  END LOOP;
END $$;

-- ============================================================================
-- 3. ADMIN SESSION LIST: fall back to the snapshot for deleted accounts
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
    COALESCE(p1.username, s.participant_1_username, 'deleted user'),
    p1.avatar_url,
    s.participant_2,
    COALESCE(p2.username, s.participant_2_username, 'deleted user'),
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
  v_snapshots BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_snapshots
  FROM public.session_messages WHERE sender_username IS NOT NULL;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'DM HISTORY NOW SURVIVES ACCOUNT DELETION';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Messages carrying a username snapshot: %', v_snapshots;
  RAISE NOTICE 'Deleting an account nulls its ids and keeps every message.';
END $$;
