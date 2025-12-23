-- FIX: Ensure attachments column exists and is JSONB
-- This is necessary for storing multiple media items including music links

DO $$ 
BEGIN
  -- 1. Check if column exists, if not add it
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='posts' AND column_name='attachments') THEN
    ALTER TABLE public.posts ADD COLUMN attachments JSONB;
    RAISE NOTICE 'Added attachments column to posts table';
  ELSE
    -- 2. If it exists, ensure it is JSONB (convert if necessary)
    -- This handles case where it might have been created as TEXT or JSON
    ALTER TABLE public.posts ALTER COLUMN attachments TYPE JSONB USING attachments::JSONB;
    RAISE NOTICE 'Ensured attachments column is JSONB';
  END IF;
END $$;

-- 3. Verify it's included in the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
