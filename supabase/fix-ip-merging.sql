-- Fix for overly aggressive IP merging
-- Reduces confidence score for IP hash matches to 50 (below merge threshold of 70)
-- This ensures users on the same IP (e.g. localhost, office wifi) appear as different guests
-- unless they share a browser fingerprint

CREATE OR REPLACE FUNCTION find_soft_linked_guest(p_fingerprint TEXT, p_ip_address TEXT DEFAULT NULL, p_ip_hash TEXT DEFAULT NULL)
RETURNS TABLE (guest_id UUID, match_type TEXT, confidence INTEGER) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    -- Priority 1: Fingerprint match (100% confidence) -> Always merge
    SELECT g.id, 'fingerprint'::TEXT, 100 FROM public.guests g 
    WHERE g.fingerprint = p_fingerprint AND g.status != 'merged' AND g.merged_user_id IS NULL
    UNION ALL
    -- Priority 2: IP Hash match (50% confidence) -> NO Auto-merge (Threshold is 70)
    SELECT g.id, 'ip_hash'::TEXT, 50 FROM public.guests g 
    WHERE g.ip_hash = p_ip_hash AND p_ip_hash IS NOT NULL AND g.status != 'merged' AND g.merged_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.guests g2 WHERE g2.fingerprint = p_fingerprint)
    UNION ALL
    -- Priority 3: IP History match (40% confidence) -> NO Auto-merge
    SELECT g.id, 'ip_history'::TEXT, 40 FROM public.guests g 
    WHERE p_ip_address IS NOT NULL AND g.ip_history @> jsonb_build_array(jsonb_build_object('ip', p_ip_address))
    AND g.status != 'merged' AND g.merged_user_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.guests g2 WHERE g2.fingerprint = p_fingerprint)
    AND NOT EXISTS (SELECT 1 FROM public.guests g2 WHERE g2.ip_hash = p_ip_hash)
    ORDER BY confidence DESC LIMIT 1;
END;
$$;
