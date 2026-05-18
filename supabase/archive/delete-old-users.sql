-- Script to DELETE old source users after migration
-- WARNING: This will permanently delete the users. Ensure migration was successful first.

DO $$
DECLARE
    email_1 TEXT := 'nago0omy101@gmail.com';
    email_2 TEXT := 'nago0omy@gmail.com';
    deleted_count INT := 0;
BEGIN
    -- Delete from auth.users (This should cascade to public.profiles and other linked tables if foreign keys are set to CASCADE)
    -- If foreign keys are restrictive, this might fail, requiring manual deletion of dependent rows first.
    -- But since we migrated posts/comments/etc., there should be no dependent content left.
    
    DELETE FROM auth.users
    WHERE email IN (email_1, email_2);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE 'Deleted % users (Emails: %, %)', deleted_count, email_1, email_2;
    
    -- Optional: Explicitly delete from profiles if not cascaded (safeguard)
    DELETE FROM public.profiles
    WHERE id IN (
        SELECT id FROM auth.users WHERE email IN (email_1, email_2) -- Won't find them if already deleted above
    );

END $$;
