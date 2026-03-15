-- Sprint 1: Simplified Database Schema for New Features
-- This migration only adds NEW tables and columns, doesn't modify existing ones

-- ============================================
-- 1. CATEGORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "Anyone can view categories"
  ON public.categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Only admins can manage categories" ON public.categories;
CREATE POLICY "Only admins can manage categories"
  ON public.categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Insert default categories
INSERT INTO public.categories (name, slug, description) VALUES
  ('Technology', 'technology', 'Tech news, tutorials, and discussions'),
  ('Gaming', 'gaming', 'Video games, esports, and gaming culture'),
  ('Art', 'art', 'Digital art, ASCII art, and creative works'),
  ('Music', 'music', 'Music reviews, recommendations, and discussions'),
  ('General', 'general', 'General discussions and miscellaneous topics')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 2. TAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tags" ON public.tags;
CREATE POLICY "Anyone can view tags"
  ON public.tags FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can create tags" ON public.tags;
CREATE POLICY "Authenticated users can create tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_tags_name ON public.tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON public.tags(usage_count DESC);

-- ============================================
-- 3. POST_TAGS JUNCTION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.post_tags (
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, tag_id)
);

ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view post tags" ON public.post_tags;
CREATE POLICY "Anyone can view post tags"
  ON public.post_tags FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Post authors can manage their post tags" ON public.post_tags;
CREATE POLICY "Post authors can manage their post tags"
  ON public.post_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE id = post_id AND user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON public.post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id ON public.post_tags(tag_id);

-- ============================================
-- 4. REACTIONS TABLE (Posts only for now)
-- ============================================
CREATE TABLE IF NOT EXISTS public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'love', 'fire', 'hundred')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reactions" ON public.reactions;
CREATE POLICY "Anyone can view reactions"
  ON public.reactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can add their own reactions" ON public.reactions;
CREATE POLICY "Users can add their own reactions"
  ON public.reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reactions" ON public.reactions;
CREATE POLICY "Users can delete their own reactions"
  ON public.reactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON public.reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON public.reactions(user_id);

-- ============================================
-- 5. NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('comment', 'reaction', 'follow', 'mention', 'reply')),
  content JSONB NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- ============================================
-- 6. FOLLOWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view follows" ON public.follows;
CREATE POLICY "Anyone can view follows"
  ON public.follows FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow others"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
CREATE POLICY "Users can unfollow"
  ON public.follows FOR DELETE
  USING (auth.uid() = follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- ============================================
-- 7. DRAFTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  content TEXT,
  tags TEXT[],
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  auto_saved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own drafts" ON public.drafts;
CREATE POLICY "Users can view their own drafts"
  ON public.drafts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own drafts" ON public.drafts;
CREATE POLICY "Users can create their own drafts"
  ON public.drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own drafts" ON public.drafts;
CREATE POLICY "Users can update their own drafts"
  ON public.drafts FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.drafts;
CREATE POLICY "Users can delete their own drafts"
  ON public.drafts FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON public.drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated_at ON public.drafts(updated_at DESC);

-- ============================================
-- 8. ADD COLUMNS TO EXISTING TABLES
-- ============================================

-- Add category_id to posts (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='posts' AND column_name='category_id') THEN
    ALTER TABLE public.posts ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
    CREATE INDEX idx_posts_category_id ON public.posts(category_id);
  END IF;
END $$;

-- Add profile enhancements (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='cover_image_url') THEN
    ALTER TABLE public.profiles ADD COLUMN cover_image_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='bio_extended') THEN
    ALTER TABLE public.profiles ADD COLUMN bio_extended TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='social_links') THEN
    ALTER TABLE public.profiles ADD COLUMN social_links JSONB DEFAULT '{}'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='profiles' AND column_name='pinned_post_id') THEN
    ALTER TABLE public.profiles ADD COLUMN pinned_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 9. HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION get_post_reaction_counts(post_uuid UUID)
RETURNS TABLE (reaction_type TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT r.reaction_type, COUNT(*)::BIGINT
  FROM public.reactions r
  WHERE r.post_id = post_uuid
  GROUP BY r.reaction_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_follower_count(user_uuid UUID)
RETURNS BIGINT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.follows
    WHERE following_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_following_count(user_uuid UUID)
RETURNS BIGINT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM public.follows
    WHERE follower_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_following(follower_uuid UUID, following_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.follows
    WHERE follower_id = follower_uuid AND following_id = following_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to increment tag usage
CREATE OR REPLACE FUNCTION increment_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tags
  SET usage_count = usage_count + 1
  WHERE id = NEW.tag_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_increment_tag_usage ON public.post_tags;
CREATE TRIGGER trigger_increment_tag_usage
  AFTER INSERT ON public.post_tags
  FOR EACH ROW
  EXECUTE FUNCTION increment_tag_usage();

-- Trigger to decrement tag usage
CREATE OR REPLACE FUNCTION decrement_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tags
  SET usage_count = GREATEST(usage_count - 1, 0)
  WHERE id = OLD.tag_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_decrement_tag_usage ON public.post_tags;
CREATE TRIGGER trigger_decrement_tag_usage
  AFTER DELETE ON public.post_tags
  FOR EACH ROW
  EXECUTE FUNCTION decrement_tag_usage();

-- Trigger to update draft timestamp
CREATE OR REPLACE FUNCTION update_draft_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.auto_saved_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_draft_timestamp ON public.drafts;
CREATE TRIGGER trigger_update_draft_timestamp
  BEFORE UPDATE ON public.drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_draft_timestamp();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
