-- ============================================================================
-- ADD MESSAGE REQUEST SYSTEM TO EXISTING CONVERSATIONS TABLE
-- Run this if you already have the conversations table created
-- ============================================================================

-- Add status column for request system
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' 
CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked'));

-- Add initiated_by to track who started the conversation
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status);

-- Update existing conversations to 'accepted' status (they were created before request system)
UPDATE public.conversations 
SET status = 'accepted' 
WHERE status IS NULL OR status = 'pending';

-- ============================================================================
-- DONE!
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ MESSAGE REQUEST SYSTEM ADDED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New conversations will start as "pending" requests.';
  RAISE NOTICE 'Existing conversations have been marked as "accepted".';
END $$;
