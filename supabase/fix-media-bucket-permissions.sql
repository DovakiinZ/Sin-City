-- Ensure media bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Loop through and drop common policies to ensure a clean slate for the media bucket
DO $$
BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated uploads to media" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow public read media" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow users to delete own media" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Public Read Media" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated Upload Media" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated Manage Media" ON storage.objects';
END $$;

-- 1. Allow public read access to everything in 'media' bucket
CREATE POLICY "Public Read Media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'media');

-- 2. Allow authenticated users to upload to 'media' bucket
CREATE POLICY "Authenticated Upload Media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media');

-- 3. Allow authenticated users to update/delete in 'media' bucket (broad permission for ease of use)
CREATE POLICY "Authenticated Manage Media"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'media');
