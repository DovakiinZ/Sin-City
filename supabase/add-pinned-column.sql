-- Add is_pinned column to posts table for pin post feature
-- Only admins can pin/unpin posts

-- Add the is_pinned column
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='posts' AND column_name='is_pinned') THEN
    ALTER TABLE public.posts ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE;
    CREATE INDEX idx_posts_is_pinned ON public.posts(is_pinned DESC);
  END IF;
END $$;

-- Create policy for admin-only pinning
DROP POLICY IF EXISTS "Only admins can pin posts" ON public.posts;
CREATE POLICY "Only admins can pin posts"
  ON public.posts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
