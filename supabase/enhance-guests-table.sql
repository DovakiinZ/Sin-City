-- ============================================================================
-- ENHANCE GUESTS TABLE FOR PERSISTENT ANONYMOUS IDENTITY
-- Adds: anon_token, merge tracking, IP history, soft-linking
-- ============================================================================

-- ============================================================================
-- STEP 1: ADD PERSISTENT TOKEN COLUMN
-- This token is returned to the client and stored in cookie/localStorage
-- It allows us to identify returning visitors even across sessions
-- ============================================================================

ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS anon_token TEXT UNIQUE;

-- Generate tokens for existing guests that don't have one
UPDATE public.guests 
SET anon_token = encode(gen_random_bytes(32), 'hex')
WHERE anon_token IS NULL;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_guests_anon_token 
    ON public.guests(anon_token) 
    WHERE anon_token IS NOT NULL;

-- ============================================================================
-- STEP 2: ADD MERGE TRACKING COLUMNS
-- When an anon registers, we merge their activity to the new user account
-- ============================================================================

ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS merged_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;

-- Add index for finding merged accounts
CREATE INDEX IF NOT EXISTS idx_guests_merged_user 
    ON public.guests(merged_user_id) 
    WHERE merged_user_id IS NOT NULL;

-- Add 'merged' to status options
ALTER TABLE public.guests 
DROP CONSTRAINT IF EXISTS guests_status_check;

ALTER TABLE public.guests 
ADD CONSTRAINT guests_status_check 
CHECK (status IN ('active', 'blocked', 'restricted', 'merged'));

-- ============================================================================
-- STEP 3: ADD IP HISTORY TRACKING
-- Store all IPs this anon has used over time
-- ============================================================================

ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS ip_history JSONB DEFAULT '[]'::jsonb;

-- ============================================================================
-- STEP 4: ADD SOFT-LINKING FOR IDENTITY RESOLUTION
-- When token is missing but IP/fingerprint matches, we can soft-link
-- ============================================================================

ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS soft_linked_from UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS soft_link_trust_score INTEGER DEFAULT 0 
    CHECK (soft_link_trust_score >= 0 AND soft_link_trust_score <= 100);

-- ============================================================================
-- STEP 5: TOKEN GENERATION TRIGGER
-- Auto-generate token on insert if not provided
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_anon_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.anon_token IS NULL THEN
        NEW.anon_token := encode(gen_random_bytes(32), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_anon_token ON public.guests;
CREATE TRIGGER trigger_generate_anon_token
    BEFORE INSERT ON public.guests
    FOR EACH ROW
    EXECUTE FUNCTION generate_anon_token();

-- ============================================================================
-- STEP 6: UPDATE IP HISTORY FUNCTION
-- Called on every visit to append new IP to history
-- ============================================================================

CREATE OR REPLACE FUNCTION update_guest_ip_history(
    p_guest_id UUID,
    p_ip_address TEXT,
    p_ip_hash TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_entry JSONB;
    v_existing_history JSONB;
BEGIN
    -- Build the new IP entry
    v_new_entry := jsonb_build_object(
        'ip', p_ip_address,
        'ip_hash', p_ip_hash,
        'country', p_country,
        'city', p_city,
        'isp', p_isp,
        'seen_at', NOW()
    );
    
    -- Get existing history
    SELECT COALESCE(ip_history, '[]'::jsonb) INTO v_existing_history
    FROM public.guests WHERE id = p_guest_id;
    
    -- Check if this IP is already the most recent entry
    IF v_existing_history->0->>'ip' = p_ip_address THEN
        -- Just update the timestamp
        v_existing_history := jsonb_set(
            v_existing_history, 
            '{0,seen_at}', 
            to_jsonb(NOW()::text)
        );
    ELSE
        -- Prepend new entry (limit history to last 50 entries)
        v_existing_history := jsonb_build_array(v_new_entry) || 
            (SELECT jsonb_agg(elem) FROM (
                SELECT elem FROM jsonb_array_elements(v_existing_history) AS elem
                LIMIT 49
            ) sub);
    END IF;
    
    -- Update the guest record
    UPDATE public.guests 
    SET 
        ip_history = v_existing_history,
        last_seen_at = NOW()
    WHERE id = p_guest_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_guest_ip_history TO anon, authenticated;

-- ============================================================================
-- STEP 7: SOFT-LINK RESOLUTION FUNCTION
-- Find potential matches when token is missing
-- ============================================================================

CREATE OR REPLACE FUNCTION find_soft_linked_guest(
    p_fingerprint TEXT,
    p_ip_address TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
    guest_id UUID,
    match_type TEXT,
    confidence INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    
    -- Exact fingerprint match (highest confidence)
    SELECT 
        g.id,
        'fingerprint'::TEXT,
        100
    FROM public.guests g
    WHERE g.fingerprint = p_fingerprint
      AND g.status != 'merged'
      AND g.merged_user_id IS NULL
    
    UNION ALL
    
    -- IP hash match (medium confidence)
    SELECT 
        g.id,
        'ip_hash'::TEXT,
        70
    FROM public.guests g
    WHERE g.ip_hash = p_ip_hash
      AND p_ip_hash IS NOT NULL
      AND g.status != 'merged'
      AND g.merged_user_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.guests g2 
          WHERE g2.fingerprint = p_fingerprint
      )
    
    UNION ALL
    
    -- IP history match (lower confidence)
    SELECT 
        g.id,
        'ip_history'::TEXT,
        50
    FROM public.guests g
    WHERE p_ip_address IS NOT NULL
      AND g.ip_history @> jsonb_build_array(jsonb_build_object('ip', p_ip_address))
      AND g.status != 'merged'
      AND g.merged_user_id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.guests g2 
          WHERE g2.fingerprint = p_fingerprint
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.guests g2 
          WHERE g2.ip_hash = p_ip_hash
      )
    
    ORDER BY confidence DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION find_soft_linked_guest TO anon, authenticated;

-- ============================================================================
-- STEP 8: RESOLVE IDENTITY FUNCTION
-- The core function that ensures every request has exactly ONE identity
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_anon_identity(
    p_anon_token TEXT DEFAULT NULL,
    p_fingerprint TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb,
    p_ip_address TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_guest RECORD;
    v_soft_link RECORD;
    v_new_guest_id UUID;
    v_result JSONB;
BEGIN
    -- =========================================================================
    -- CASE 1: Token provided - direct lookup
    -- =========================================================================
    IF p_anon_token IS NOT NULL AND p_anon_token != '' THEN
        SELECT * INTO v_guest 
        FROM public.guests 
        WHERE anon_token = p_anon_token
          AND status != 'merged'
          AND merged_user_id IS NULL;
        
        IF FOUND THEN
            -- Update activity and IP history
            PERFORM update_guest_ip_history(
                v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp
            );
            
            -- Update other fields
            UPDATE public.guests SET
                session_id = COALESCE(p_session_id, session_id),
                device_info = COALESCE(p_device_info, device_info),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
                tor_detected = COALESCE(p_tor_detected, tor_detected),
                last_seen_at = NOW()
            WHERE id = v_guest.id;
            
            RETURN jsonb_build_object(
                'success', true,
                'guest_id', v_guest.id,
                'anon_id', v_guest.anonymous_id,
                'anon_token', v_guest.anon_token,
                'status', v_guest.status,
                'trust_score', v_guest.trust_score,
                'is_new', false,
                'match_type', 'token'
            );
        END IF;
    END IF;
    
    -- =========================================================================
    -- CASE 2: No token or token not found - try fingerprint match
    -- =========================================================================
    IF p_fingerprint IS NOT NULL AND p_fingerprint != '' THEN
        SELECT * INTO v_guest 
        FROM public.guests 
        WHERE fingerprint = p_fingerprint
          AND status != 'merged'
          AND merged_user_id IS NULL;
        
        IF FOUND THEN
            -- Update activity and IP history
            PERFORM update_guest_ip_history(
                v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp
            );
            
            -- Update other fields
            UPDATE public.guests SET
                session_id = COALESCE(p_session_id, session_id),
                device_info = COALESCE(p_device_info, device_info),
                vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
                tor_detected = COALESCE(p_tor_detected, tor_detected),
                last_seen_at = NOW()
            WHERE id = v_guest.id;
            
            RETURN jsonb_build_object(
                'success', true,
                'guest_id', v_guest.id,
                'anon_id', v_guest.anonymous_id,
                'anon_token', v_guest.anon_token,
                'status', v_guest.status,
                'trust_score', v_guest.trust_score,
                'is_new', false,
                'match_type', 'fingerprint'
            );
        END IF;
    END IF;
    
    -- =========================================================================
    -- CASE 3: Try soft-linking via IP
    -- =========================================================================
    SELECT * INTO v_soft_link
    FROM find_soft_linked_guest(p_fingerprint, p_ip_address, p_ip_hash);
    
    IF FOUND AND v_soft_link.confidence >= 70 THEN
        SELECT * INTO v_guest 
        FROM public.guests 
        WHERE id = v_soft_link.guest_id;
        
        IF FOUND THEN
            -- Update with new fingerprint (soft-link)
            UPDATE public.guests SET
                soft_linked_from = array_append(COALESCE(soft_linked_from, '{}'), v_guest.id),
                soft_link_trust_score = v_soft_link.confidence,
                fingerprint = COALESCE(p_fingerprint, fingerprint),
                session_id = COALESCE(p_session_id, session_id),
                last_seen_at = NOW()
            WHERE id = v_guest.id;
            
            -- Update IP history
            PERFORM update_guest_ip_history(
                v_guest.id, p_ip_address, p_ip_hash, p_country, p_city, p_isp
            );
            
            RETURN jsonb_build_object(
                'success', true,
                'guest_id', v_guest.id,
                'anon_id', v_guest.anonymous_id,
                'anon_token', v_guest.anon_token,
                'status', v_guest.status,
                'trust_score', v_guest.trust_score,
                'is_new', false,
                'match_type', 'soft_link',
                'soft_link_confidence', v_soft_link.confidence
            );
        END IF;
    END IF;
    
    -- =========================================================================
    -- CASE 4: No match found - create new guest
    -- =========================================================================
    INSERT INTO public.guests (
        fingerprint,
        session_id,
        device_info,
        ip_hash,
        country,
        city,
        isp,
        vpn_detected,
        tor_detected,
        flags,
        ip_history
    ) VALUES (
        COALESCE(p_fingerprint, 'unknown-' || encode(gen_random_bytes(16), 'hex')),
        p_session_id,
        p_device_info,
        p_ip_hash,
        p_country,
        p_city,
        p_isp,
        COALESCE(p_vpn_detected, false),
        COALESCE(p_tor_detected, false),
        ARRAY['new'],
        CASE WHEN p_ip_address IS NOT NULL THEN
            jsonb_build_array(jsonb_build_object(
                'ip', p_ip_address,
                'ip_hash', p_ip_hash,
                'country', p_country,
                'city', p_city,
                'isp', p_isp,
                'seen_at', NOW()
            ))
        ELSE '[]'::jsonb END
    )
    RETURNING id INTO v_new_guest_id;
    
    -- Get the created guest
    SELECT * INTO v_guest FROM public.guests WHERE id = v_new_guest_id;
    
    -- Log the identity creation
    PERFORM log_activity(
        'anon', v_new_guest_id, 'identity_resolve',
        NULL, NULL, jsonb_build_object('is_new', true)
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'guest_id', v_guest.id,
        'anon_id', v_guest.anonymous_id,
        'anon_token', v_guest.anon_token,
        'status', v_guest.status,
        'trust_score', v_guest.trust_score,
        'is_new', true,
        'match_type', 'created'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_anon_identity TO anon, authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.guests.anon_token IS 'Persistent token for client identification - stored in cookie/localStorage';
COMMENT ON COLUMN public.guests.merged_user_id IS 'If this anon registered, this is their new user ID';
COMMENT ON COLUMN public.guests.merged_at IS 'When the merge occurred';
COMMENT ON COLUMN public.guests.ip_history IS 'JSONB array of all IPs this anon has used';
COMMENT ON COLUMN public.guests.soft_linked_from IS 'Other anon IDs that were linked to this one';
COMMENT ON FUNCTION resolve_anon_identity IS 'Core identity resolution - ensures every request has exactly ONE identity';

SELECT 'Guest table enhancements complete!' AS status;
