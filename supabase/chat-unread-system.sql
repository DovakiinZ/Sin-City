-- ============================================================================
-- CHAT UNREAD MESSAGE COUNT SYSTEM
-- Leverages existing session_read_status table for backend-authoritative counts
-- ============================================================================

-- ============================================================================
-- 1. GLOBAL UNREAD COUNT FUNCTION
-- Returns total unread messages across all conversations for the current user
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
  -- Ensure user is authenticated
  IF v_current_user IS NULL THEN
    RETURN 0;
  END IF;

  -- Count unread messages across all sessions
  -- A message is unread if:
  -- 1. It was NOT sent by the current user
  -- 2. It was created AFTER the user's last_read_at for that session
  --    (or the session has no read status record, meaning never read)
  SELECT COALESCE(SUM(unread_per_session), 0)::INTEGER
  INTO v_unread_count
  FROM (
    SELECT 
      s.id AS session_id,
      COUNT(m.id) AS unread_per_session
    FROM public.message_sessions s
    -- Get all messages in this session not sent by current user
    LEFT JOIN public.session_messages m 
      ON m.session_id = s.id 
      AND m.sender_id != v_current_user
    -- Get read status for current user
    LEFT JOIN public.session_read_status srs 
      ON srs.session_id = s.id 
      AND srs.user_id = v_current_user
    WHERE 
      -- User is a participant in this session
      (s.participant_1 = v_current_user OR s.participant_2 = v_current_user)
      -- Session is active (not archived or blocked)
      AND s.status = 'active'
      -- Message exists and is newer than last read
      AND m.id IS NOT NULL
      AND (
        -- No read status = all messages are unread
        srs.last_read_at IS NULL
        OR
        -- Message created after last read
        m.created_at > srs.last_read_at
      )
    GROUP BY s.id
  ) AS session_counts;

  RETURN v_unread_count;
END;
$$;

-- ============================================================================
-- 2. CONVERSATION UNREAD COUNT FUNCTION
-- Returns unread message count for a specific conversation
-- ============================================================================
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
  -- Ensure user is authenticated
  IF v_current_user IS NULL THEN
    RETURN 0;
  END IF;

  -- Verify user is a participant in this session
  IF NOT EXISTS (
    SELECT 1 FROM public.message_sessions
    WHERE id = p_session_id
    AND (participant_1 = v_current_user OR participant_2 = v_current_user)
  ) THEN
    RETURN 0;
  END IF;

  -- Get last read timestamp for this session
  SELECT last_read_at INTO v_last_read_at
  FROM public.session_read_status
  WHERE session_id = p_session_id
  AND user_id = v_current_user;

  -- Count unread messages
  IF v_last_read_at IS NULL THEN
    -- No read status = all messages from other user are unread
    SELECT COUNT(*)::INTEGER INTO v_unread_count
    FROM public.session_messages
    WHERE session_id = p_session_id
    AND sender_id != v_current_user;
  ELSE
    -- Count messages created after last read
    SELECT COUNT(*)::INTEGER INTO v_unread_count
    FROM public.session_messages
    WHERE session_id = p_session_id
    AND sender_id != v_current_user
    AND created_at > v_last_read_at;
  END IF;

  RETURN v_unread_count;
END;
$$;

-- ============================================================================
-- 3. GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.get_global_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_unread_count(UUID) TO authenticated;

-- ============================================================================
-- 4. SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ CHAT UNREAD COUNT SYSTEM INSTALLED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Functions:';
  RAISE NOTICE '  - get_global_unread_count() - Total unread across all conversations';
  RAISE NOTICE '  - get_conversation_unread_count(session_id) - Unread for specific conversation';
  RAISE NOTICE '';
  RAISE NOTICE 'Existing function:';
  RAISE NOTICE '  - mark_session_as_read(session_id) - Mark conversation as read';
END $$;
