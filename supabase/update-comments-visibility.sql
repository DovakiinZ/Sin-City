-- Add hidden column and update RLS policies for comments
-- Run this in Supabase SQL Editor

-- 1. Add hidden column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'comments' 
    AND column_name = 'hidden'
  ) THEN
    ALTER TABLE public.comments ADD COLUMN hidden BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_comments_hidden ON public.comments(hidden);

-- 3. Update RLS policies
-- Drop existing select policy
DROP POLICY IF EXISTS "comments_select_policy" ON public.comments;
DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
DROP POLICY IF EXISTS "Anyone can read comments" ON public.comments;

-- SELECT: Only authenticated users can read. Non-admins cannot see hidden comments.
CREATE POLICY "comments_select_policy"
    ON public.comments FOR SELECT
    TO authenticated
    USING (
        NOT hidden 
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- UPDATE: Admins can update any comment (to toggle hidden), users can update their own
DROP POLICY IF EXISTS "comments_update_policy" ON public.comments;
DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;

CREATE POLICY "comments_update_policy"
    ON public.comments FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        auth.uid() = user_id 
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- DELETE: Already handled by comments_delete_own_or_admin in fix-comments-and-delete.sql
-- But let's make sure it's consistent
DROP POLICY IF EXISTS "comments_delete_policy" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own_or_admin" ON public.comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;

CREATE POLICY "comments_delete_policy"
    ON public.comments FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR 
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Success message
SELECT 'Comments table updated with hidden column and restricted RLS!' as status;
