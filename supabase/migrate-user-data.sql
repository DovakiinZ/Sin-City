-- Migration script to transfer data based on EMAIL addresses
-- Run this in the Supabase SQL Editor

DO $$
DECLARE
    -- Source emails to check (will pick the first one found)
    source_email_1 TEXT := 'nago0omy101@gmail.com';
    source_email_2 TEXT := 'nago0omy@gmail.com';
    target_email TEXT := 'nagham@cicada.city';
    
    source_user_id UUID;
    target_user_id UUID;
    
    found_source_email TEXT;
    target_username TEXT;
BEGIN
    -- 1. Get Source User ID (Check both emails)
    SELECT id, email INTO source_user_id, found_source_email
    FROM auth.users 
    WHERE email IN (source_email_1, source_email_2)
    LIMIT 1;
    
    -- 2. Get Target User ID
    SELECT id INTO target_user_id
    FROM auth.users 
    WHERE email = target_email;

    -- 3. Get Target Username (for denormalized fields)
    SELECT username INTO target_username
    FROM public.profiles
    WHERE id = target_user_id;

    -- Validation
    IF source_user_id IS NULL THEN
        RAISE EXCEPTION 'None of the source emails (% or %) were found in auth.users', source_email_1, source_email_2;
    END IF;
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user with email % not found in auth.users', target_email;
    END IF;

    RAISE NOTICE 'Migrating data from % (%) to % (ID: %, Username: %)', found_source_email, source_user_id, target_email, target_user_id, target_username;

    -- 3. Migrate POSTS
    -- Update user_id and denormalized fields
    UPDATE public.posts 
    SET 
        user_id = target_user_id,
        author_name = COALESCE(target_username, author_name) -- Use new username if available, else keep old
        -- author_username does not exist in posts table
    WHERE user_id = source_user_id;
    
    RAISE NOTICE 'Migrated posts';

    -- 4. Migrate COMMENTS
    -- Explicitly cast UUID to text because comments.user_id seems to be text type
    UPDATE public.comments
    SET 
        user_id = target_user_id::text,
        author_name = COALESCE(target_username, author_name)
    WHERE user_id = source_user_id::text;

    RAISE NOTICE 'Migrated comments';

    -- 5. Migrate REACTIONS (Likes)
    -- Handle conflicts: If target already liked the post, delete source's like
    DELETE FROM public.reactions
    WHERE user_id = source_user_id
    AND post_id IN (
        SELECT post_id FROM public.reactions WHERE user_id = target_user_id
    );

    -- Move remaining reactions
    UPDATE public.reactions
    SET user_id = target_user_id
    WHERE user_id = source_user_id;

    RAISE NOTICE 'Migrated reactions';

    -- 6. Migrate FOLLOWS (Following)
    -- If target is already following user X, delete source's follow of X
    DELETE FROM public.follows
    WHERE follower_id = source_user_id
    AND following_id IN (
        SELECT following_id FROM public.follows WHERE follower_id = target_user_id
    );

    -- Move remaining followings
    UPDATE public.follows
    SET follower_id = target_user_id
    WHERE follower_id = source_user_id;

    RAISE NOTICE 'Migrated following list';

    -- 7. Migrate FOLLOWS (Followers)
    -- If user X is already following target, delete user X's follow of source
    DELETE FROM public.follows
    WHERE following_id = source_user_id
    AND follower_id IN (
        SELECT follower_id FROM public.follows WHERE following_id = target_user_id
    );

    -- Move remaining followers
    UPDATE public.follows
    SET following_id = target_user_id
    WHERE following_id = source_user_id;

    RAISE NOTICE 'Migrated followers list';

    -- 8. Migrate NOTIFICATIONS
    UPDATE public.notifications
    SET user_id = target_user_id
    WHERE user_id = source_user_id;

    RAISE NOTICE 'Migrated notifications';

    -- 9. Migrate BOOKMARKS
    -- Handle conflicts: If target already bookmarked the post, delete source's bookmark
    DELETE FROM public.bookmarks
    WHERE user_id = source_user_id
    AND post_id IN (
        SELECT post_id FROM public.bookmarks WHERE user_id = target_user_id
    );

    -- Move remaining bookmarks
    UPDATE public.bookmarks
    SET user_id = target_user_id
    WHERE user_id = source_user_id;

    RAISE NOTICE 'Migrated bookmarks';

    RAISE NOTICE 'Migration completed successfully from % to %', source_email_1, target_email;

END $$;
