-- ============================================================================
-- Post-mention notifications. Idempotent; safe to re-run.
-- NOTE: follow-request notifications are already created client-side
-- (useFollow.ts) and comment-mention notifications are already created
-- client-side (useComments.ts); those triggers are intentionally omitted here
-- to avoid double bell entries.
-- ============================================================================

-- 1. MENTION HELPER ---------------------------------------------------------
-- Best-effort @handle parser: extracts @username tokens from free text and
-- inserts one 'mention' notification per existing, distinct, non-self user.
CREATE OR REPLACE FUNCTION public.create_mention_notifications(
  p_text TEXT, p_actor_id UUID, p_actor_name TEXT, p_context JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_handle TEXT;
  v_target UUID;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN;
  END IF;
  FOR v_handle IN
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(p_text, '@([A-Za-z0-9_]{2,30})', 'g') AS m
  LOOP
    v_target := NULL;  -- reset: SELECT INTO leaves the prior value when no row matches
    SELECT id INTO v_target FROM public.profiles WHERE lower(username) = v_handle;
    IF v_target IS NULL OR v_target = p_actor_id THEN
      CONTINUE;
    END IF;
    INSERT INTO public.notifications (user_id, type, content, read)
    VALUES (
      v_target,
      'mention',
      p_context || jsonb_build_object('author', COALESCE(p_actor_name, 'Someone'), 'actorId', p_actor_id),
      false
    );
  END LOOP;
END; $$;

-- 2. POST MENTIONS ----------------------------------------------------------
-- Post mentions (author's own text; post has no author_name, look it up)
CREATE OR REPLACE FUNCTION public.notify_on_post_mention()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author TEXT;
BEGIN
  SELECT username INTO v_author FROM public.profiles WHERE id = NEW.user_id;
  PERFORM public.create_mention_notifications(
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''),
    NEW.user_id, v_author,
    jsonb_build_object('source', 'post', 'postId', NEW.id, 'postSlug', NEW.slug, 'postTitle', NEW.title)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_post_mention ON public.posts;
CREATE TRIGGER on_post_mention
  AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_post_mention();

DO $$ BEGIN RAISE NOTICE '✅ post-mention notifications installed'; END $$;
