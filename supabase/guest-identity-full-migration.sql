-- ============================================================================
-- GUEST INTELLIGENCE + IDENTITY SYSTEM — FULL MIGRATION
-- Run this single file in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 0: NUCLEAR CLEANUP
-- Drop old functions (all overloads), triggers, and stale tables
-- ============================================================================
DO $$
DECLARE
  func_name TEXT;
  r RECORD;
BEGIN
  -- Drop all overloads of old functions
  FOREACH func_name IN ARRAY ARRAY[
    'resolve_anon_identity',
    'auto_merge_on_registration',
    'detect_identity_links',
    'resolve_guest_identity',
    'increment_guest_visits',
    'match_guest_signals',
    'link_guest_to_user',
    'merge_guest_identity'
  ]
  LOOP
    FOR r IN
      SELECT oid::regprocedure::text AS sig
      FROM pg_proc
      WHERE proname = func_name
        AND pronamespace = 'public'::regnamespace
    LOOP
      EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
    END LOOP;
  END LOOP;

  -- Drop old triggers on guests
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'guests') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_detect_identity_links ON public.guests';
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_auto_merge ON public.guests';
    EXECUTE 'DROP TRIGGER IF EXISTS trigger_auto_merge_on_registration ON public.guests';
    EXECUTE 'DROP TRIGGER IF EXISTS update_guests_updated_at ON public.guests';
  END IF;

  -- Drop old triggers on identity_links
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'identity_links') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_identity_links_updated_at ON public.identity_links';
  END IF;

  -- Drop old tables completely so we get a clean schema
  -- (old guests table has incompatible columns)
  DROP TABLE IF EXISTS public.identity_links CASCADE;
  DROP TABLE IF EXISTS public.guest_activity_log CASCADE;
  DROP TABLE IF EXISTS public.guest_user_map CASCADE;
  DROP TABLE IF EXISTS public.guests CASCADE;
END $$;

-- ============================================================================
-- STEP 1: GUESTS TABLE (fresh)
-- ============================================================================
CREATE TABLE public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id TEXT UNIQUE NOT NULL,
  fingerprint_hash TEXT,
  canvas_fingerprint TEXT,
  audio_fingerprint TEXT,
  font_fingerprint TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  screen_resolution TEXT,
  timezone TEXT,
  language TEXT,
  platform TEXT,
  plugins_count INTEGER,
  do_not_track BOOLEAN,
  cookies_enabled BOOLEAN,
  city TEXT,
  country TEXT,
  isp TEXT,
  device_type TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  visit_count INTEGER DEFAULT 1,
  total_pages_viewed INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  behavior_signals JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view guests" ON public.guests;
CREATE POLICY "Admins can view guests"
  ON public.guests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service can manage guests" ON public.guests;
CREATE POLICY "Service can manage guests"
  ON public.guests FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_guests_anonymous_id ON public.guests(anonymous_id);
CREATE INDEX idx_guests_fingerprint_hash ON public.guests(fingerprint_hash);
CREATE INDEX idx_guests_canvas_fingerprint ON public.guests(canvas_fingerprint);
CREATE INDEX idx_guests_audio_fingerprint ON public.guests(audio_fingerprint);
CREATE INDEX idx_guests_ip_hash ON public.guests(ip_hash);
CREATE INDEX idx_guests_last_seen ON public.guests(last_seen_at DESC);

-- ============================================================================
-- STEP 2: IDENTITY LINKS TABLE
-- ============================================================================
CREATE TABLE public.identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_a_id TEXT NOT NULL,
  identity_a_type TEXT NOT NULL CHECK (identity_a_type IN ('guest', 'user')),
  identity_b_id TEXT NOT NULL,
  identity_b_type TEXT NOT NULL CHECK (identity_b_type IN ('guest', 'user')),
  link_type TEXT NOT NULL CHECK (link_type IN ('same_fingerprint', 'same_ip', 'same_device', 'merged', 'suspected')),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  matched_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT no_self_link CHECK (
    NOT (identity_a_id = identity_b_id AND identity_a_type = identity_b_type)
  ),
  CONSTRAINT unique_link UNIQUE (identity_a_id, identity_a_type, identity_b_id, identity_b_type)
);

ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view identity links" ON public.identity_links;
CREATE POLICY "Admins can view identity links"
  ON public.identity_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service can manage identity links" ON public.identity_links;
CREATE POLICY "Service can manage identity links"
  ON public.identity_links FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_identity_links_a ON public.identity_links(identity_a_id, identity_a_type);
CREATE INDEX idx_identity_links_b ON public.identity_links(identity_b_id, identity_b_type);
CREATE INDEX idx_identity_links_type ON public.identity_links(link_type);
CREATE INDEX idx_identity_links_confidence ON public.identity_links(confidence_score DESC);

-- ============================================================================
-- STEP 3: GUEST ACTIVITY LOG
-- ============================================================================
CREATE TABLE public.guest_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'page_view', 'scroll', 'click', 'time_on_page',
    'comment_attempt', 'reaction', 'search', 'share',
    'login', 'register', 'identity_resolved'
  )),
  event_data JSONB DEFAULT '{}'::jsonb,
  page_url TEXT,
  referrer TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.guest_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view guest activity" ON public.guest_activity_log;
CREATE POLICY "Admins can view guest activity"
  ON public.guest_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service can insert guest activity" ON public.guest_activity_log;
CREATE POLICY "Service can insert guest activity"
  ON public.guest_activity_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_guest_activity_anonymous_id ON public.guest_activity_log(anonymous_id);
CREATE INDEX idx_guest_activity_event_type ON public.guest_activity_log(event_type);
CREATE INDEX idx_guest_activity_created_at ON public.guest_activity_log(created_at DESC);
CREATE INDEX idx_guest_activity_session ON public.guest_activity_log(session_id);

-- ============================================================================
-- STEP 4: GUEST-TO-USER MAP
-- ============================================================================
CREATE TABLE public.guest_user_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  resolved_at TIMESTAMPTZ DEFAULT NOW(),
  resolution_method TEXT NOT NULL CHECK (resolution_method IN ('login', 'register', 'manual', 'fingerprint')),
  confidence INTEGER DEFAULT 100,
  CONSTRAINT unique_guest_user UNIQUE (anonymous_id, user_id)
);

ALTER TABLE public.guest_user_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view guest user map" ON public.guest_user_map;
CREATE POLICY "Admins can view guest user map"
  ON public.guest_user_map FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service can manage guest user map" ON public.guest_user_map;
CREATE POLICY "Service can manage guest user map"
  ON public.guest_user_map FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_guest_user_map_anonymous ON public.guest_user_map(anonymous_id);
CREATE INDEX idx_guest_user_map_user ON public.guest_user_map(user_id);

-- ============================================================================
-- STEP 5: FUNCTIONS
-- ============================================================================

-- 5a. Increment visit count
CREATE OR REPLACE FUNCTION increment_guest_visits(p_anonymous_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.guests
  SET visit_count = visit_count + 1,
      last_seen_at = NOW()
  WHERE anonymous_id = p_anonymous_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5b. Weighted identity detection (trigger function)
CREATE OR REPLACE FUNCTION detect_identity_links()
RETURNS TRIGGER AS $$
DECLARE
  existing RECORD;
  score INTEGER;
  signals JSONB;
  link TEXT;
BEGIN
  FOR existing IN
    SELECT * FROM public.guests
    WHERE id != NEW.id
    AND last_seen_at > NOW() - INTERVAL '90 days'
  LOOP
    score := 0;
    signals := '{}'::jsonb;
    link := 'suspected';

    -- Canvas fingerprint match (40 points)
    IF NEW.canvas_fingerprint IS NOT NULL
       AND existing.canvas_fingerprint IS NOT NULL
       AND NEW.canvas_fingerprint = existing.canvas_fingerprint THEN
      score := score + 40;
      signals := signals || '{"canvas": 40}'::jsonb;
    END IF;

    -- Audio fingerprint match (40 points)
    IF NEW.audio_fingerprint IS NOT NULL
       AND existing.audio_fingerprint IS NOT NULL
       AND NEW.audio_fingerprint = existing.audio_fingerprint THEN
      score := score + 40;
      signals := signals || '{"audio": 40}'::jsonb;
    END IF;

    -- Full fingerprint hash match (60 points, capped)
    IF NEW.fingerprint_hash IS NOT NULL
       AND existing.fingerprint_hash IS NOT NULL
       AND NEW.fingerprint_hash = existing.fingerprint_hash THEN
      IF score < 60 THEN
        score := 60;
      END IF;
      signals := signals || '{"fingerprint": 60}'::jsonb;
      link := 'same_fingerprint';
    END IF;

    -- Timezone + language match (15 points)
    IF NEW.timezone IS NOT NULL AND existing.timezone IS NOT NULL
       AND NEW.language IS NOT NULL AND existing.language IS NOT NULL
       AND NEW.timezone = existing.timezone
       AND NEW.language = existing.language THEN
      score := score + 15;
      signals := signals || '{"timezone_lang": 15}'::jsonb;
    END IF;

    -- Screen resolution match (10 points)
    IF NEW.screen_resolution IS NOT NULL
       AND existing.screen_resolution IS NOT NULL
       AND NEW.screen_resolution = existing.screen_resolution THEN
      score := score + 10;
      signals := signals || '{"screen": 10}'::jsonb;
    END IF;

    -- ISP + city match (10 points)
    IF NEW.isp IS NOT NULL AND existing.isp IS NOT NULL
       AND NEW.city IS NOT NULL AND existing.city IS NOT NULL
       AND NEW.isp = existing.isp
       AND NEW.city = existing.city THEN
      score := score + 10;
      signals := signals || '{"isp_city": 10}'::jsonb;
    END IF;

    -- IP hash match (20 points — weak signal)
    IF NEW.ip_hash IS NOT NULL
       AND existing.ip_hash IS NOT NULL
       AND NEW.ip_hash = existing.ip_hash THEN
      score := score + 20;
      signals := signals || '{"ip": 20}'::jsonb;
      IF link = 'suspected' THEN
        link := 'same_ip';
      END IF;
    END IF;

    -- Add total to signals
    signals := signals || jsonb_build_object('total', score);

    -- Determine link type
    IF score >= 71 THEN
      link := 'same_device';
    ELSIF NEW.fingerprint_hash IS NOT NULL
          AND existing.fingerprint_hash IS NOT NULL
          AND NEW.fingerprint_hash = existing.fingerprint_hash THEN
      link := 'same_fingerprint';
    END IF;

    -- Only create link if score > 0
    IF score > 0 THEN
      INSERT INTO public.identity_links (
        identity_a_id, identity_a_type,
        identity_b_id, identity_b_type,
        link_type, confidence_score, matched_signals
      ) VALUES (
        NEW.anonymous_id, 'guest',
        existing.anonymous_id, 'guest',
        link, score, signals
      )
      ON CONFLICT (identity_a_id, identity_a_type, identity_b_id, identity_b_type)
      DO UPDATE SET
        link_type = EXCLUDED.link_type,
        confidence_score = EXCLUDED.confidence_score,
        matched_signals = EXCLUDED.matched_signals,
        updated_at = NOW();
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5c. Resolve guest to user identity
CREATE OR REPLACE FUNCTION resolve_guest_identity(
  p_anonymous_id TEXT,
  p_user_id UUID,
  p_method TEXT DEFAULT 'login'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.guest_user_map (anonymous_id, user_id, resolution_method)
  VALUES (p_anonymous_id, p_user_id, p_method)
  ON CONFLICT (anonymous_id, user_id) DO UPDATE
  SET resolved_at = NOW();

  INSERT INTO public.identity_links (
    identity_a_id, identity_a_type,
    identity_b_id, identity_b_type,
    link_type, confidence_score,
    matched_signals
  ) VALUES (
    p_anonymous_id, 'guest',
    p_user_id::TEXT, 'user',
    'merged', 100,
    jsonb_build_object('method', p_method, 'total', 100)
  )
  ON CONFLICT (identity_a_id, identity_a_type, identity_b_id, identity_b_type)
  DO UPDATE SET
    confidence_score = 100,
    link_type = 'merged',
    updated_at = NOW();

  INSERT INTO public.guest_activity_log (
    anonymous_id, event_type, event_data
  ) VALUES (
    p_anonymous_id, 'identity_resolved',
    jsonb_build_object('user_id', p_user_id, 'method', p_method)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: TRIGGERS
-- ============================================================================

CREATE TRIGGER update_guests_updated_at
  BEFORE UPDATE ON public.guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_identity_links_updated_at
  BEFORE UPDATE ON public.identity_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_detect_identity_links
  AFTER INSERT OR UPDATE ON public.guests
  FOR EACH ROW
  EXECUTE FUNCTION detect_identity_links();

-- ============================================================================
-- DONE
-- ============================================================================
