-- Fix ALL Storage Buckets RLS
-- Run this to fix 400/406 errors for media and posts buckets

-- ============================================================================
-- 1. ENSURE BUCKETS EXIST AND ARE PUBLIC
-- ============================================================================

-- Media bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Posts bucket (for post attachments)
INSERT INTO storage.buckets (id, name, public)  
VALUES ('posts', 'posts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================================
-- 2. DROP ALL CONFLICTING POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Owner Update" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete" ON storage.objects;
DROP POLICY IF EXISTS "Media Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Media Auth Insert" ON storage.objects;
DROP POLICY IF EXISTS "Media Auth Update" ON storage.objects;
DROP POLICY IF EXISTS "Media Auth Delete" ON storage.objects;
DROP POLICY IF EXISTS "Posts Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Posts Auth Insert" ON storage.objects;
DROP POLICY IF EXISTS "Posts Anon Insert" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes for own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to media" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read media" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update media" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete media" ON storage.objects;
DROP POLICY IF EXISTS "Universal Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Universal Insert Access" ON storage.objects;

-- ============================================================================
-- 3. CREATE UNIVERSAL READ POLICY (most important for 400 errors)
-- ============================================================================

-- Allow EVERYONE to read from media and posts buckets
CREATE POLICY "Universal Read Access"
ON storage.objects FOR SELECT
TO anon, authenticated
USING ( bucket_id IN ('media', 'posts') );

-- ============================================================================
-- 4. INSERT POLICIES
-- ============================================================================

-- Allow authenticated users to upload to media bucket
CREATE POLICY "Media Auth Insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'media' );

-- Allow anonymous AND authenticated users to upload to posts bucket
CREATE POLICY "Posts Universal Insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK ( bucket_id = 'posts' );

-- ============================================================================
-- 5. UPDATE/DELETE POLICIES
-- ============================================================================

-- Allow authenticated users to update in media bucket  
CREATE POLICY "Media Auth Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'media' );

-- Allow authenticated users to delete from media bucket
CREATE POLICY "Media Auth Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'media' );

-- Allow anyone to update/delete from posts bucket (for guest posts)
CREATE POLICY "Posts Universal Update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING ( bucket_id = 'posts' );

CREATE POLICY "Posts Universal Delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING ( bucket_id = 'posts' );

-- Verify
SELECT 'Storage RLS fixed for media and posts buckets' as status;
