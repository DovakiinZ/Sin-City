-- =====================================================
-- Text Alignment Schema
-- =====================================================
-- Adds text_align column to posts, comments, and messages

-- Add to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS text_align TEXT DEFAULT 'right' 
CHECK (text_align IN ('right', 'center', 'left'));

-- Add to comments table
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS text_align TEXT DEFAULT 'right' 
CHECK (text_align IN ('right', 'center', 'left'));

-- Add to dm_messages table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dm_messages') THEN
        ALTER TABLE public.dm_messages 
        ADD COLUMN IF NOT EXISTS text_align TEXT DEFAULT 'right';
    END IF;
END $$;

SELECT 'Text alignment columns added' AS status;
