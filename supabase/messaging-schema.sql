-- ============================================================================
-- SIN CITY MESSAGING SYSTEM - COMPLETE SCHEMA
-- Session-based messaging with masked identities
-- ============================================================================

-- ============================================================================
-- 1. MESSAGE SESSIONS (Time-bounded, not infinite chats)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.message_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  participant_2 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  started_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Ensure consistent ordering and prevent duplicates
  CONSTRAINT unique_session UNIQUE(participant_1, participant_2),
  CONSTRAINT ordered_participants CHECK (participant_1 < participant_2)
);

-- Enable RLS
ALTER TABLE public.message_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own sessions"
  ON public.message_sessions FOR SELECT
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

CREATE POLICY "Authenticated users can create sessions"
  ON public.message_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);

CREATE POLICY "Users can update their own sessions"
  ON public.message_sessions FOR UPDATE
  USING (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_participant_1 ON public.message_sessions(participant_1);
CREATE INDEX IF NOT EXISTS idx_sessions_participant_2 ON public.message_sessions(participant_2);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.message_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON public.message_sessions(last_activity_at DESC);

-- ============================================================================
-- 2. SESSION MESSAGES (with masked identity support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.message_sessions(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Identity options
  use_masked_identity BOOLEAN DEFAULT false,
  masked_alias TEXT, -- e.g. "Unknown_7F3"
  
  -- Content (only one type per message)
  content TEXT,
  gif_url TEXT,
  gif_id TEXT, -- GIPHY ID for reference
  voice_url TEXT,
  voice_duration_seconds INTEGER CHECK (voice_duration_seconds <= 60),
  
  -- Status
  read_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT false, -- Soft delete for admin visibility
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view messages in their sessions"
  ON public.session_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

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
    )
  );

CREATE POLICY "Users can update read status"
  ON public.session_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.message_sessions s
      WHERE s.id = session_id
      AND (s.participant_1 = auth.uid() OR s.participant_2 = auth.uid())
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_session ON public.session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.session_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.session_messages(created_at DESC);

-- ============================================================================
-- 3. USER MESSAGING SETTINGS (Trust levels, restrictions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_messaging_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Trust system
  trust_level TEXT DEFAULT 'low' CHECK (trust_level IN ('low', 'medium', 'high')),
  
  -- Restrictions
  messaging_enabled BOOLEAN DEFAULT true,
  is_shadow_muted BOOLEAN DEFAULT false, -- Messages appear sent but aren't delivered
  is_restricted BOOLEAN DEFAULT false,
  
  -- Analytics
  total_messages_sent INTEGER DEFAULT 0,
  messages_today INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_rate_limit_reset TIMESTAMPTZ DEFAULT now(),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_messaging_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own settings"
  ON public.user_messaging_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON public.user_messaging_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON public.user_messaging_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. MASKED IDENTITIES (Admin can see real identity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.masked_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  masked_alias TEXT NOT NULL UNIQUE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.masked_identities ENABLE ROW LEVEL SECURITY;

-- Policies (Users can only see their own, admin bypass via function)
CREATE POLICY "Users can view their own masks"
  ON public.masked_identities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own masks"
  ON public.masked_identities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_masks_user ON public.masked_identities(user_id);

-- ============================================================================
-- 5. FUNCTIONS
-- ============================================================================

-- Generate or get masked alias for a user
CREATE OR REPLACE FUNCTION public.get_or_create_masked_alias(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alias TEXT;
BEGIN
  -- Check for existing alias
  SELECT masked_alias INTO v_alias
  FROM public.masked_identities
  WHERE user_id = p_user_id
  LIMIT 1;
  
  IF v_alias IS NULL THEN
    -- Generate new alias: Unknown_XXXX (hex suffix)
    v_alias := 'Unknown_' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 4));
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM public.masked_identities WHERE masked_alias = v_alias) LOOP
      v_alias := 'Unknown_' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 4));
    END LOOP;
    
    INSERT INTO public.masked_identities (user_id, masked_alias)
    VALUES (p_user_id, v_alias);
  END IF;
  
  RETURN v_alias;
END;
$$;

-- Get or create session between two users
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
BEGIN
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF v_current_user = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;
  
  -- Ensure consistent ordering
  IF v_current_user < p_other_user_id THEN
    v_user_1 := v_current_user;
    v_user_2 := p_other_user_id;
  ELSE
    v_user_1 := p_other_user_id;
    v_user_2 := v_current_user;
  END IF;
  
  -- Check for existing session
  SELECT id INTO v_session_id
  FROM public.message_sessions
  WHERE participant_1 = v_user_1 AND participant_2 = v_user_2;
  
  IF v_session_id IS NULL THEN
    -- Create new session
    INSERT INTO public.message_sessions (participant_1, participant_2)
    VALUES (v_user_1, v_user_2)
    RETURNING id INTO v_session_id;
  ELSIF (SELECT status FROM public.message_sessions WHERE id = v_session_id) = 'archived' THEN
    -- Reactivate archived session
    UPDATE public.message_sessions
    SET status = 'active', last_activity_at = now(), archived_at = NULL
    WHERE id = v_session_id;
  END IF;
  
  RETURN v_session_id;
END;
$$;

-- Check if user can send message (rate limiting, permissions)
CREATE OR REPLACE FUNCTION public.can_send_message(p_user_id UUID, p_content_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_hourly_limit INTEGER := 100;
BEGIN
  -- Get or create user settings
  INSERT INTO public.user_messaging_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  SELECT * INTO v_settings
  FROM public.user_messaging_settings
  WHERE user_id = p_user_id;
  
  -- Check if messaging is enabled
  IF NOT v_settings.messaging_enabled THEN
    RETURN false;
  END IF;
  
  -- Check if restricted
  IF v_settings.is_restricted THEN
    RETURN false;
  END IF;
  
  -- Check rate limit (reset every hour)
  IF v_settings.last_rate_limit_reset < now() - INTERVAL '1 hour' THEN
    UPDATE public.user_messaging_settings
    SET messages_today = 0, last_rate_limit_reset = now()
    WHERE user_id = p_user_id;
  ELSIF v_settings.messages_today >= v_hourly_limit THEN
    RETURN false;
  END IF;
  
  -- Check trust level for content type
  IF p_content_type = 'gif' AND v_settings.trust_level = 'low' THEN
    RETURN false;
  END IF;
  
  IF p_content_type = 'voice' AND v_settings.trust_level != 'high' THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Admin function to view all sessions
CREATE OR REPLACE FUNCTION public.admin_get_all_sessions()
RETURNS TABLE (
  session_id UUID,
  participant_1_id UUID,
  participant_1_username TEXT,
  participant_2_id UUID,
  participant_2_username TEXT,
  status TEXT,
  message_count INTEGER,
  last_activity TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    s.id,
    s.participant_1,
    p1.username,
    s.participant_2,
    p2.username,
    s.status,
    s.message_count,
    s.last_activity_at
  FROM public.message_sessions s
  LEFT JOIN public.profiles p1 ON p1.id = s.participant_1
  LEFT JOIN public.profiles p2 ON p2.id = s.participant_2
  ORDER BY s.last_activity_at DESC;
END;
$$;

-- Admin function to reveal masked identity
CREATE OR REPLACE FUNCTION public.admin_reveal_identity(p_masked_alias TEXT)
RETURNS TABLE (
  masked_alias TEXT,
  real_user_id UUID,
  real_username TEXT,
  real_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    m.masked_alias,
    m.user_id,
    p.username,
    u.email
  FROM public.masked_identities m
  JOIN public.profiles p ON p.id = m.user_id
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.masked_alias = p_masked_alias;
END;
$$;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Update session activity on new message
CREATE OR REPLACE FUNCTION public.update_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.message_sessions
  SET 
    last_activity_at = now(),
    message_count = message_count + 1
  WHERE id = NEW.session_id;
  
  -- Update sender stats
  UPDATE public.user_messaging_settings
  SET 
    total_messages_sent = total_messages_sent + 1,
    messages_today = messages_today + 1,
    last_message_at = now()
  WHERE user_id = NEW.sender_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_sent
  AFTER INSERT ON public.session_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_session_activity();

-- Auto-archive inactive sessions (run via cron)
CREATE OR REPLACE FUNCTION public.archive_inactive_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.message_sessions
  SET 
    status = 'archived',
    archived_at = now()
  WHERE 
    status = 'active'
    AND last_activity_at < now() - INTERVAL '7 days';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 7. ENABLE REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_sessions;

-- ============================================================================
-- DONE!
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ SIN CITY MESSAGING SYSTEM INSTALLED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables: message_sessions, session_messages, user_messaging_settings, masked_identities';
  RAISE NOTICE 'Functions: get_or_create_session, get_or_create_masked_alias, can_send_message';
  RAISE NOTICE 'Admin: admin_get_all_sessions, admin_reveal_identity';
END $$;
