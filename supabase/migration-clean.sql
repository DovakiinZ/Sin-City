-- Clean Migration Script for Sin City Blog
-- This script safely updates your existing schema

-- ============================================================================
-- DROP EXISTING POLICIES (to recreate them)
-- ============================================================================

DROP POLICY IF EXISTS "Published posts readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Posts are readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Anyone can insert posts (demo)" ON public.posts;
DROP POLICY IF EXISTS "Authenticated users can insert posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.posts;

DROP POLICY IF EXISTS "Comments readable by anyone" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can comment" ON public.comments;
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;

DROP POLICY IF EXISTS "Reactions readable by anyone" ON public.reactions;
DROP POLICY IF EXISTS "Authenticated users can react" ON public.reactions;
DROP POLICY IF EXISTS "Users can delete own reactions" ON public.reactions;

-- ============================================================================
-- ENSURE TABLES EXIST WITH ALL COLUMNS
-- ============================================================================

-- Add missing columns to posts table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='draft') THEN
    ALTER TABLE public.posts ADD COLUMN draft boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='slug') THEN
    ALTER TABLE public.posts ADD COLUMN slug text UNIQUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='tags') THEN
    ALTER TABLE public.posts ADD COLUMN tags text[];
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='view_count') THEN
    ALTER TABLE public.posts ADD COLUMN view_count integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='updated_at') THEN
    ALTER TABLE public.posts ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create comments table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create reactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('+1', '!', '*', '#')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, reaction_type)
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON public.posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_draft ON public.posts(draft);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON public.reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON public.reactions(user_id);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE NEW POLICIES
-- ============================================================================

-- POSTS POLICIES
CREATE POLICY "Published posts readable by anyone"
  ON public.posts FOR SELECT
  USING (draft = false OR auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Users can update own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id);

-- COMMENTS POLICIES
CREATE POLICY "Comments readable by anyone"
  ON public.comments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can comment"
  ON public.comments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Users can update own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);

-- REACTIONS POLICIES
CREATE POLICY "Reactions readable by anyone"
  ON public.reactions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can react"
  ON public.reactions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Users can delete own reactions"
  ON public.reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at 
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_comments_updated_at ON public.comments;
CREATE TRIGGER update_comments_updated_at 
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Increment view count function
CREATE OR REPLACE FUNCTION increment_post_views(post_uuid uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.posts
  SET view_count = view_count + 1
  WHERE id = post_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Schema migration completed successfully!';
  RAISE NOTICE 'Tables: posts, comments, reactions';
  RAISE NOTICE 'Next step: Enable real-time in Database > Replication';
END $$;
