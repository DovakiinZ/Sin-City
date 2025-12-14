-- Fix the notify_on_comment trigger to handle TEXT post_id
-- Run this in Supabase SQL Editor

-- Drop the old trigger first
DROP TRIGGER IF EXISTS on_comment_notify ON public.comments;

-- Recreate the function with proper type casting
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_owner_id UUID;
  post_title TEXT;
  commenter_name TEXT;
BEGIN
  -- Get the post owner and title (cast post_id TEXT to UUID for comparison)
  SELECT user_id, title INTO post_owner_id, post_title
  FROM public.posts
  WHERE id::TEXT = NEW.post_id;
  
  -- Get commenter name
  commenter_name := NEW.author_name;
  
  -- Don't notify if commenting on own post
  IF post_owner_id IS NOT NULL AND post_owner_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, content)
    VALUES (
      post_owner_id,
      'comment',
      jsonb_build_object(
        'postId', NEW.post_id,
        'postSlug', NEW.post_id,
        'postTitle', post_title,
        'author', commenter_name,
        'commentId', NEW.id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_comment_notify
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_comment();

-- Done! The trigger now handles TEXT post_id correctly
