-- FIX: Ensure attachments column exists and is JSONB (Version 2)
-- Removed ALTER PUBLICATION to avoid errors if already added

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
