-- ============================================================
-- ENHANCED ADMIN USER DETAILS
-- Engagement stats, admin notes, alt detection, risk scoring
-- ============================================================

-- 1. ADMIN NOTES TABLE
CREATE TABLE IF NOT EXISTS public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'guest')),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage notes" ON public.admin_notes;
CREATE POLICY "Admins can manage notes"
  ON public.admin_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_notes_target ON public.admin_notes(target_id, target_type);

-- 2. GET USER ENGAGEMENT STATS
CREATE OR REPLACE FUNCTION get_user_engagement_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  post_stats RECORD;
  comment_stats RECORD;
  reactions_given INT;
  reactions_received INT;
  dm_count INT;
  last_active TIMESTAMPTZ;
  active_hour INT;
  age_days INT;
BEGIN
  -- Post stats
  SELECT
    COUNT(*) as total,
    COALESCE(AVG(LENGTH(content)), 0)::INT as avg_length,
    MAX(created_at) as last_post
  INTO post_stats
  FROM public.posts
  WHERE user_id = p_user_id AND (is_deleted IS NOT TRUE);

  -- Comment stats
  SELECT COUNT(*) as total, MAX(created_at) as last_comment
  INTO comment_stats
  FROM public.comments WHERE user_id = p_user_id;

  -- Reactions given
  SELECT COUNT(*) INTO reactions_given FROM public.reactions WHERE user_id = p_user_id;

  -- Reactions received on user's posts
  SELECT COUNT(*) INTO reactions_received
  FROM public.reactions r JOIN public.posts p ON r.post_id = p.id
  WHERE p.user_id = p_user_id;

  -- DM message count
  SELECT COALESCE(SUM(message_count), 0)::INT INTO dm_count
  FROM public.message_sessions
  WHERE participant_1 = p_user_id OR participant_2 = p_user_id;

  -- Last active
  last_active := GREATEST(
    post_stats.last_post,
    comment_stats.last_comment,
    (SELECT last_seen_at FROM public.profiles WHERE id = p_user_id)
  );

  -- Most active posting hour
  SELECT EXTRACT(HOUR FROM created_at)::INT INTO active_hour
  FROM public.posts WHERE user_id = p_user_id
  GROUP BY EXTRACT(HOUR FROM created_at)
  ORDER BY COUNT(*) DESC LIMIT 1;

  -- Account age
  SELECT EXTRACT(DAY FROM NOW() - created_at)::INT INTO age_days
  FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'posts', post_stats.total,
    'comments', comment_stats.total,
    'reactions_given', reactions_given,
    'reactions_received', reactions_received,
    'avg_post_length', post_stats.avg_length,
    'dm_messages', dm_count,
    'last_active', last_active,
    'most_active_hour', active_hour,
    'account_age_days', COALESCE(age_days, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. GET USER ALT ACCOUNTS
CREATE OR REPLACE FUNCTION get_user_alt_accounts(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  links JSONB;
  ip_matches JSONB;
BEGIN
  -- Direct identity links
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', il.id,
    'other_id', CASE WHEN il.identity_a_id = p_user_id::text THEN il.identity_b_id ELSE il.identity_a_id END,
    'other_type', CASE WHEN il.identity_a_id = p_user_id::text THEN il.identity_b_type ELSE il.identity_a_type END,
    'link_type', il.link_type,
    'confidence', il.confidence_score,
    'signals', il.matched_signals
  )), '[]'::jsonb) INTO links
  FROM public.identity_links il
  WHERE il.identity_a_id = p_user_id::text OR il.identity_b_id = p_user_id::text;

  -- Users sharing same IP hash
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', p2.id,
    'username', p2.username,
    'role', p2.role,
    'last_seen', p2.last_seen_at
  )), '[]'::jsonb) INTO ip_matches
  FROM public.profiles p1
  JOIN public.profiles p2 ON p1.ip_hash = p2.ip_hash
  WHERE p1.id = p_user_id AND p2.id != p_user_id AND p1.ip_hash IS NOT NULL;

  RETURN jsonb_build_object(
    'identity_links', links,
    'same_ip_users', ip_matches,
    'total_alts', jsonb_array_length(links) + jsonb_array_length(ip_matches)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. GET ADMIN NOTES
CREATE OR REPLACE FUNCTION get_admin_notes(p_target_id TEXT, p_target_type TEXT DEFAULT 'user')
RETURNS JSONB AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', n.id,
      'content', n.content,
      'admin_username', p.username,
      'created_at', n.created_at
    ) ORDER BY n.created_at DESC)
    FROM public.admin_notes n
    JOIN public.profiles p ON n.admin_id = p.id
    WHERE n.target_id = p_target_id AND n.target_type = p_target_type
  ), '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. ADD ADMIN NOTE
CREATE OR REPLACE FUNCTION add_admin_note(p_target_id TEXT, p_target_type TEXT, p_content TEXT)
RETURNS JSONB AS $$
DECLARE
  new_note public.admin_notes;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not admin');
  END IF;

  INSERT INTO public.admin_notes (target_id, target_type, admin_id, content)
  VALUES (p_target_id, p_target_type, auth.uid(), p_content)
  RETURNING * INTO new_note;

  RETURN jsonb_build_object('success', true, 'note_id', new_note.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. CALCULATE USER RISK SCORE
CREATE OR REPLACE FUNCTION get_user_risk_score(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  score INT := 0;
  factors JSONB := '[]'::jsonb;
  profile RECORD;
  post_count INT;
  account_age INT;
BEGIN
  SELECT * INTO profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('score', 0, 'level', 'safe', 'factors', '[]'); END IF;

  SELECT COUNT(*) INTO post_count FROM public.posts WHERE user_id = p_user_id AND is_deleted IS NOT TRUE;
  account_age := EXTRACT(DAY FROM NOW() - profile.created_at)::INT;

  -- Risk factors
  IF profile.vpn_detected THEN
    score := score + 15;
    factors := factors || jsonb_build_object('factor', 'VPN detected', 'points', 15, 'severity', 'medium');
  END IF;

  IF profile.tor_detected THEN
    score := score + 25;
    factors := factors || jsonb_build_object('factor', 'Tor detected', 'points', 25, 'severity', 'high');
  END IF;

  IF account_age < 1 THEN
    score := score + 20;
    factors := factors || jsonb_build_object('factor', 'Account < 24h old', 'points', 20, 'severity', 'medium');
  ELSIF account_age < 7 THEN
    score := score + 10;
    factors := factors || jsonb_build_object('factor', 'Account < 1 week old', 'points', 10, 'severity', 'low');
  END IF;

  IF (SELECT COUNT(*) FROM public.posts WHERE user_id = p_user_id AND created_at > NOW() - INTERVAL '1 hour') > 10 THEN
    score := score + 30;
    factors := factors || jsonb_build_object('factor', 'Rapid posting (>10/hr)', 'points', 30, 'severity', 'high');
  END IF;

  IF (SELECT COUNT(*) FROM public.profiles WHERE ip_hash = profile.ip_hash AND id != p_user_id AND ip_hash IS NOT NULL) > 0 THEN
    score := score + 15;
    factors := factors || jsonb_build_object('factor', 'Shares IP with other users', 'points', 15, 'severity', 'medium');
  END IF;

  -- Trust factors
  IF account_age > 30 THEN
    score := score - 10;
    factors := factors || jsonb_build_object('factor', 'Account > 30 days', 'points', -10, 'severity', 'trust');
  END IF;

  IF post_count > 5 THEN
    score := score - 10;
    factors := factors || jsonb_build_object('factor', 'Active contributor (>5 posts)', 'points', -10, 'severity', 'trust');
  END IF;

  score := GREATEST(0, LEAST(100, score));

  RETURN jsonb_build_object(
    'score', score,
    'level', CASE
      WHEN score >= 70 THEN 'critical'
      WHEN score >= 40 THEN 'warning'
      WHEN score >= 20 THEN 'low'
      ELSE 'safe'
    END,
    'factors', factors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ADMIN QUICK ACTIONS
CREATE OR REPLACE FUNCTION admin_restrict_user(p_user_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not admin');
  END IF;

  -- Ensure messaging settings row exists
  INSERT INTO public.user_messaging_settings (user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;

  CASE p_action
    WHEN 'shadow_mute' THEN
      UPDATE public.user_messaging_settings SET is_shadow_muted = true WHERE user_id = p_user_id;
    WHEN 'unshadow_mute' THEN
      UPDATE public.user_messaging_settings SET is_shadow_muted = false WHERE user_id = p_user_id;
    WHEN 'restrict' THEN
      UPDATE public.user_messaging_settings SET is_restricted = true WHERE user_id = p_user_id;
    WHEN 'unrestrict' THEN
      UPDATE public.user_messaging_settings SET is_restricted = false WHERE user_id = p_user_id;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unknown action');
  END CASE;

  INSERT INTO public.admin_audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, 'user', p_user_id::text, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'action', p_action);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION get_user_engagement_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_alt_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_notes TO authenticated;
GRANT EXECUTE ON FUNCTION add_admin_note TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_risk_score TO authenticated;
GRANT EXECUTE ON FUNCTION admin_restrict_user TO authenticated;

NOTIFY pgrst, 'reload schema';
