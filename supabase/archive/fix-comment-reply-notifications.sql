-- ============================================================================
-- FIX COMMENT REPLY NOTIFICATIONS
-- Run in Supabase SQL Editor
-- ============================================================================

-- Enhanced notify function that handles both post comments and replies
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  post_owner_id UUID;
  post_title TEXT;
  commenter_name TEXT;
  parent_comment_author UUID;
  parent_comment_author_name TEXT;
BEGIN
  -- Get the post owner and title
  SELECT user_id, title INTO post_owner_id, post_title
  FROM public.posts
  WHERE id = NEW.post_id;
  
  -- Get commenter name
  commenter_name := COALESCE(NEW.author_name, 'Someone');
  
  -- Notify post owner (if commenting on their post, not self-comment, and not a reply)
  IF post_owner_id IS NOT NULL 
     AND post_owner_id != NEW.user_id 
     AND NEW.parent_id IS NULL THEN
    INSERT INTO public.notifications (user_id, type, content)
    VALUES (
      post_owner_id,
      'comment',
      jsonb_build_object(
        'postId', NEW.post_id,
        'postTitle', post_title,
        'author', commenter_name,
        'commentId', NEW.id
      )
    );
  END IF;
  
  -- If this is a reply (has parent_id), notify the parent comment author
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id, author_name 
    INTO parent_comment_author, parent_comment_author_name
    FROM public.comments 
    WHERE id = NEW.parent_id;
    
    -- Don't notify if replying to own comment
    IF parent_comment_author IS NOT NULL AND parent_comment_author != NEW.user_id THEN
      INSERT INTO public.notifications (user_id, type, content)
      VALUES (
        parent_comment_author,
        'reply',
        jsonb_build_object(
          'postId', NEW.post_id,
          'postTitle', post_title,
          'commentId', NEW.id,
          'parentCommentId', NEW.parent_id,
          'author', commenter_name
        )
      );
    END IF;
    
    -- Also notify post owner if they're not the parent comment author
    -- and not the person replying
    IF post_owner_id IS NOT NULL 
       AND post_owner_id != NEW.user_id 
       AND post_owner_id != parent_comment_author THEN
      INSERT INTO public.notifications (user_id, type, content)
      VALUES (
        post_owner_id,
        'comment',
        jsonb_build_object(
          'postId', NEW.post_id,
          'postTitle', post_title,
          'author', commenter_name,
          'commentId', NEW.id,
          'isReply', true
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_comment_notify ON public.comments;
CREATE TRIGGER on_comment_notify
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_comment();

-- ============================================================================
-- DONE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Comment reply notifications fixed!';
  RAISE NOTICE 'Now handles: post comments, replies to comments, and notifies post owner on all activity';
END $$;
