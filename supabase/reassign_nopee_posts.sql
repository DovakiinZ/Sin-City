-- Reassign posts by 'Nopee' to user 'npnp'
-- This fixes the "Profile not found" error by linking the posts to the correct, existing user.

DO $$
DECLARE
    target_user_id uuid;
BEGIN
    -- 1. Find the ID of 'npnp'
    SELECT id INTO target_user_id FROM profiles WHERE username = 'npnp';

    IF target_user_id IS NOT NULL THEN
        -- 2. Update posts where author is Nopee (case insensitive)
        UPDATE posts 
        SET user_id = target_user_id 
        WHERE author_name ILIKE '%Nopee%';
        
        RAISE NOTICE '✅ Successfully reassigned Nopee posts to npnp (ID: %)', target_user_id;
    ELSE
        RAISE NOTICE '❌ User @npnp not found! Please create the account first.';
    END IF;
END $$;
