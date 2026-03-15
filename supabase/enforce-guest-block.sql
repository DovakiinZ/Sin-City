-- Add database-level enforcement for blocked guests
-- This is a safety net in case the frontend check is bypassed

-- Function to check if guest is allowed to post
CREATE OR REPLACE FUNCTION check_guest_can_post()
RETURNS TRIGGER AS $$
DECLARE
    v_guest_status TEXT;
BEGIN
    -- Only check if this is a guest post (has guest_id)
    IF NEW.guest_id IS NOT NULL THEN
        -- Get the guest status
        SELECT status INTO v_guest_status
        FROM public.guests
        WHERE id = NEW.guest_id;
        
        -- Block the insert if guest is blocked
        IF v_guest_status = 'blocked' THEN
            RAISE EXCEPTION 'Guest is blocked from posting';
        END IF;
        
        -- Could also check for 'restricted' status here if needed
        -- For now, restricted guests can still post but with warnings on frontend
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run before post insert
DROP TRIGGER IF EXISTS trigger_check_guest_can_post ON public.posts;
CREATE TRIGGER trigger_check_guest_can_post
    BEFORE INSERT ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION check_guest_can_post();

-- Add comment for documentation
COMMENT ON FUNCTION check_guest_can_post() IS 'Prevents blocked guests from creating posts - database-level enforcement';
