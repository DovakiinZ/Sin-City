-- ============================================================================
-- DIRECT FIX: Merge ANON-844061 into ANON-ASEEL (same person, duplicate records)
-- ============================================================================

DO $$
DECLARE
    v_aseel_id UUID;
    v_duplicate_id UUID;
    v_real_fingerprint TEXT;
    v_device_info JSONB;
BEGIN
    -- Get ANON-ASEEL guest ID
    SELECT id INTO v_aseel_id 
    FROM public.guests 
    WHERE anonymous_id = 'ANON-ASEEL';
    
    -- Get the duplicate guest (ANON-844061)
    SELECT id, fingerprint, device_info INTO v_duplicate_id, v_real_fingerprint, v_device_info
    FROM public.guests 
    WHERE anonymous_id = 'ANON-844061';
    
    RAISE NOTICE 'ASEEL ID: %', v_aseel_id;
    RAISE NOTICE 'Duplicate ID: %', v_duplicate_id;
    RAISE NOTICE 'Real fingerprint: %', v_real_fingerprint;
    
    -- Update ASEEL with the real fingerprint and device info
    UPDATE public.guests
    SET fingerprint = v_real_fingerprint,
        device_info = v_device_info,
        flags = array_remove(flags, 'pending_fingerprint'),
        notes = 'Fingerprint captured from ANON-844061 on ' || NOW()::TEXT,
        last_seen_at = NOW()
    WHERE id = v_aseel_id;
    
    -- Transfer posts from duplicate to ASEEL
    UPDATE public.posts
    SET guest_id = v_aseel_id
    WHERE guest_id = v_duplicate_id;
    
    -- Transfer comments from duplicate to ASEEL
    UPDATE public.comments
    SET guest_id = v_aseel_id
    WHERE guest_id = v_duplicate_id;
    
    -- Update post count
    UPDATE public.guests
    SET post_count = (SELECT COUNT(*) FROM posts WHERE guest_id = v_aseel_id)
    WHERE id = v_aseel_id;
    
    -- Mark duplicate as merged (or delete it)
    UPDATE public.guests
    SET status = 'merged',
        flags = COALESCE(flags, ARRAY[]::TEXT[]) || ARRAY['merged_to_aseel'],
        notes = 'Merged into ANON-ASEEL on ' || NOW()::TEXT
    WHERE id = v_duplicate_id;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ ANON-844061 merged into ANON-ASEEL!';
    RAISE NOTICE '========================================';
END $$;

-- Verify
SELECT 'ANON-ASEEL after merge:' as info;
SELECT id, anonymous_id, fingerprint, status, post_count, device_info
FROM guests 
WHERE anonymous_id = 'ANON-ASEEL';
