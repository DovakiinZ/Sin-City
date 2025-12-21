-- Guest Email Verification Schema
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. ADD VERIFICATION COLUMNS TO GUESTS TABLE
-- ============================================================================

-- Add OTP verification columns
ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS verification_code_hash TEXT,
ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verification_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_guests_verification_expires 
ON public.guests(verification_expires_at) 
WHERE verification_expires_at IS NOT NULL;

-- ============================================================================
-- 2. FUNCTION TO SET VERIFICATION CODE
-- ============================================================================

CREATE OR REPLACE FUNCTION set_guest_verification_code(
    p_guest_id UUID,
    p_code_hash TEXT,
    p_email TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_last_sent TIMESTAMPTZ;
BEGIN
    -- Check rate limit (1 email per 2 minutes)
    SELECT email_sent_at INTO v_last_sent
    FROM public.guests
    WHERE id = p_guest_id;
    
    IF v_last_sent IS NOT NULL AND v_last_sent > NOW() - INTERVAL '2 minutes' THEN
        RAISE EXCEPTION 'Rate limit exceeded. Please wait before requesting another code.';
    END IF;
    
    -- Update guest with verification code
    UPDATE public.guests
    SET 
        email = p_email,
        verification_code_hash = p_code_hash,
        verification_expires_at = NOW() + INTERVAL '10 minutes',
        verification_attempts = 0,
        email_sent_at = NOW()
    WHERE id = p_guest_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. FUNCTION TO VERIFY CODE
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_guest_code(
    p_guest_id UUID,
    p_code_hash TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    trust_score INTEGER
) AS $$
DECLARE
    v_stored_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_attempts INTEGER;
    v_new_trust INTEGER;
BEGIN
    -- Get current verification data
    SELECT 
        verification_code_hash, 
        verification_expires_at, 
        verification_attempts
    INTO v_stored_hash, v_expires_at, v_attempts
    FROM public.guests
    WHERE id = p_guest_id;
    
    -- Check if code was ever set
    IF v_stored_hash IS NULL THEN
        RETURN QUERY SELECT FALSE, 'No verification code found', 0;
        RETURN;
    END IF;
    
    -- Check expiration
    IF v_expires_at < NOW() THEN
        RETURN QUERY SELECT FALSE, 'Verification code expired', 0;
        RETURN;
    END IF;
    
    -- Check attempts limit
    IF v_attempts >= 5 THEN
        RETURN QUERY SELECT FALSE, 'Too many attempts. Request a new code.', 0;
        RETURN;
    END IF;
    
    -- Increment attempts
    UPDATE public.guests
    SET verification_attempts = verification_attempts + 1
    WHERE id = p_guest_id;
    
    -- Verify the code
    IF v_stored_hash = p_code_hash THEN
        -- Success! Mark as verified and increase trust score
        UPDATE public.guests
        SET 
            email_verified = TRUE,
            verification_code_hash = NULL,
            verification_expires_at = NULL,
            verification_attempts = 0,
            trust_score = LEAST(100, trust_score + 25),
            flags = array_remove(flags, 'new') || ARRAY['verified']
        WHERE id = p_guest_id
        RETURNING trust_score INTO v_new_trust;
        
        RETURN QUERY SELECT TRUE, 'Email verified successfully', v_new_trust;
        RETURN;
    ELSE
        RETURN QUERY SELECT FALSE, 'Invalid verification code', 0;
        RETURN;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION set_guest_verification_code TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_guest_code TO anon, authenticated;

-- Verify
SELECT 'Guest verification schema created successfully' as status;
