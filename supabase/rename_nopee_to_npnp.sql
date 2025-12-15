-- Migration to replace "Nopee" with "Npnp" system-wide.
-- Logic:
-- 1. If "Npnp" already exists as a user, merge "Nopee" data into it.
-- 2. If "Npnp" does not exist, rename "Nopee" to "Npnp".
-- 3. Update all denormalized author_name fields in posts, comments, notifications.

DO $$
DECLARE
    nopee_id uuid;
    npnp_id uuid;
BEGIN
    -- Get IDs
    SELECT id INTO nopee_id FROM profiles WHERE username ILIKE 'nopee';
    SELECT id INTO npnp_id FROM profiles WHERE username ILIKE 'npnp';

    RAISE NOTICE 'Found Nopee ID: %', nopee_id;
    RAISE NOTICE 'Found Npnp ID: %', npnp_id;

    -- Scenario 1: Both exist. Merge Nopee -> Npnp
    IF nopee_id IS NOT NULL AND npnp_id IS NOT NULL THEN
        RAISE NOTICE 'Both users exist. Merging Nopee into Npnp...';
        
        -- Reassign posts
        UPDATE posts SET user_id = npnp_id WHERE user_id = nopee_id;
        
        -- Reassign comments
        UPDATE comments SET user_id = npnp_id WHERE user_id = nopee_id;
        
        -- Reassign likes/reactions (handle conflicts if Npnp already liked)
        BEGIN
            UPDATE reactions SET user_id = npnp_id WHERE user_id = nopee_id;
        EXCEPTION WHEN unique_violation THEN
            -- If Npnp already liked the same post, just delete the Nopee like
            DELETE FROM reactions WHERE user_id = nopee_id;
        END;

        -- Delete Nopee profile
        DELETE FROM profiles WHERE id = nopee_id;
        -- Note: We can't easily delete from auth.users without admin privileges/RPC, 
        -- but removing from profiles effectively hides them.

    -- Scenario 2: Only Nopee exists. Rename Nopee -> Npnp
    ELSIF nopee_id IS NOT NULL AND npnp_id IS NULL THEN
        RAISE NOTICE 'Only Nopee exists. Renaming to Npnp...';
        
        UPDATE profiles 
        SET username = 'Npnp', 
            display_name = 'Npnp' 
        WHERE id = nopee_id;
        
        npnp_id := nopee_id; -- For denormalized updates below

    -- Scenario 3: Only Npnp exists (or neither). Just clean up denormalized references.
    ELSE
        RAISE NOTICE 'Nopee profile not found (or only Npnp exists). Proceeding to clean up text references...';
    END IF;

    -- Update denormalized fields (Text replacements)
    -- This runs regardless of the scenario to catch any string remnants
    
    -- 1. Posts author_name
    UPDATE posts 
    SET author_name = 'Npnp' 
    WHERE author_name ILIKE 'nopee';

    -- 2. Comments author_name
    UPDATE comments 
    SET author_name = 'Npnp' 
    WHERE author_name ILIKE 'nopee';

    -- 3. Notifications (JSON content)
    -- Need to fix author name in the JSON blob
    UPDATE notifications
    SET content = jsonb_set(
        content, 
        '{author}', 
        '"Npnp"'
    )
    WHERE content->>'author' ILIKE 'nopee';
    
    -- Fix likerUsername if it was Nopee
    UPDATE notifications
    SET content = jsonb_set(
        content, 
        '{likerUsername}', 
        '"Npnp"'
    )
    WHERE content->>'likerUsername' ILIKE 'nopee';

    RAISE NOTICE 'Migration complete. "Nopee" has been replaced with "Npnp".';

END $$;
