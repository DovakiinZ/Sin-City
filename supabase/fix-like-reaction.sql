-- Update reactions table to use 'like' instead of old reaction types
-- This allows the simplified thumbs up like button to work

-- First, drop the old constraint if it exists
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS reactions_reaction_type_check;

-- Add new constraint that allows 'like'
ALTER TABLE public.reactions ADD CONSTRAINT reactions_reaction_type_check 
  CHECK (reaction_type IN ('like', 'love', 'fire', 'hundred', '+1', '!', '*', '#'));

-- Remove the unique constraint on post_id and user_id so users can like multiple times
-- (or keep it if you want one like per user per post)
-- If you want to allow toggling likes (like/unlike), keep this constraint:
-- The existing UNIQUE(post_id, user_id) should be fine
