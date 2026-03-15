-- Add is_registered_only column to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_registered_only BOOLEAN DEFAULT false;

-- Update SELECT policy to enforce registered-only visibility
DROP POLICY IF EXISTS "Posts are readable by anyone" ON public.posts;
DROP POLICY IF EXISTS "Public posts are viewable by everyone" ON public.posts;

CREATE POLICY "Selective post visibility"
  ON public.posts FOR SELECT
  USING (
    (is_registered_only = false) OR 
    (auth.role() = 'authenticated')
  );
