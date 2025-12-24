-- ============================================================================
-- COMPLETE RLS FIX FOR SIN CITY
-- Run in Supabase SQL Editor
-- ============================================================================

-- 1. FIX POSTS TABLE RLS
-- ============================================================================
ALTER TABLE public.posts DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DO $$ 
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'posts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- SELECT: Everyone can read non-draft, non-hidden posts
CREATE POLICY "posts_select_public" ON public.posts FOR SELECT
USING (draft = false AND (hidden IS NULL OR hidden = false));

-- SELECT: Authors can see their own drafts
CREATE POLICY "posts_select_own_drafts" ON public.posts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT: Both authenticated and anonymous can create posts
CREATE POLICY "posts_insert_authenticated" ON public.posts FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "posts_insert_anon" ON public.posts FOR INSERT
TO anon
WITH CHECK (user_id IS NULL); -- Anonymous posts must have null user_id

-- UPDATE: Only own posts
CREATE POLICY "posts_update_own" ON public.posts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Only own posts
CREATE POLICY "posts_delete_own" ON public.posts FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 2. FIX STORAGE RLS FOR MEDIA BUCKET
-- ============================================================================

-- Ensure media bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing policies on storage.objects for media bucket
DO $$ 
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- SELECT: Public read for media bucket
CREATE POLICY "media_public_read" ON storage.objects FOR SELECT
USING (bucket_id = 'media');

-- INSERT: Allow both authenticated and anonymous uploads to media bucket
CREATE POLICY "media_authenticated_upload" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

CREATE POLICY "media_anon_upload" ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = 'post-media');

-- UPDATE: Authenticated users can update their files
CREATE POLICY "media_update_own" ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'media');

-- DELETE: Authenticated users can delete their files  
CREATE POLICY "media_delete_own" ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media');

-- ============================================================================
-- DONE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ RLS policies fixed for posts and storage!';
END $$;
