-- ============================================================================
-- FIX ANON-ASEEL: Update fingerprint to real value and merge duplicate records
-- ============================================================================
-- The issue: ANON-ASEEL has a placeholder fingerprint, so when she visits,
-- a NEW guest record is created. We need to:
-- 1. Find her real fingerprint from the most recent guest record she created
-- 2. Update ANON-ASEEL with the real fingerprint
-- 3. Merge any duplicate posts/comments
-- ============================================================================

DO $$
DECLARE
    v_aseel_id UUID;
    v_new_guest_id UUID;
    v_real_fingerprint TEXT;
    v_posts_merged INT := 0;
    v_comments_merged INT := 0;
BEGIN
    -- Get ANON-ASEEL guest ID
    SELECT id INTO v_aseel_id 
    FROM public.guests 
    WHERE anonymous_id = 'ANON-ASEEL';
    
    IF v_aseel_id IS NULL THEN
        RAISE NOTICE 'ANON-ASEEL not found!';
        RETURN;
    END IF;
    
    RAISE NOTICE 'ANON-ASEEL guest ID: %', v_aseel_id;
    
    -- Find the most recent guest that was created (likely ASEEL's new record)
    -- Looking for any guest created after ANON-ASEEL that might be her
    SELECT id, fingerprint INTO v_new_guest_id, v_real_fingerprint
    FROM public.guests
    WHERE id != v_aseel_id
      AND fingerprint NOT LIKE 'PENDING-%'
      AND fingerprint NOT LIKE 'SYSTEM%'
      AND first_seen_at >= (SELECT first_seen_at FROM guests WHERE id = v_aseel_id)
    ORDER BY first_seen_at DESC
    LIMIT 1;
    
    IF v_real_fingerprint IS NULL THEN
        RAISE NOTICE 'No recent guest with real fingerprint found';
        
        -- Alternative: Check for any guest with matching IP or recent activity
        SELECT id, fingerprint INTO v_new_guest_id, v_real_fingerprint
        FROM public.guests
        WHERE id != v_aseel_id
          AND fingerprint NOT LIKE 'PENDING-%'
          AND fingerprint NOT LIKE 'SYSTEM%'
          AND last_seen_at >= NOW() - INTERVAL '1 day'
        ORDER BY last_seen_at DESC
        LIMIT 1;
    END IF;
    
    IF v_real_fingerprint IS NOT NULL THEN
        RAISE NOTICE 'Found potential duplicate guest: %', v_new_guest_id;
        RAISE NOTICE 'Real fingerprint: %', v_real_fingerprint;
        
        -- Update ANON-ASEEL with the real fingerprint
        UPDATE public.guests
        SET fingerprint = v_real_fingerprint,
            flags = array_remove(flags, 'pending_fingerprint'),
            notes = 'Fingerprint captured and merged on ' || NOW()::TEXT,
            last_seen_at = NOW()
        WHERE id = v_aseel_id;
        
        RAISE NOTICE 'Updated ANON-ASEEL fingerprint';
        
        -- Transfer any posts from the duplicate guest to ANON-ASEEL
        UPDATE public.posts
        SET guest_id = v_aseel_id
        WHERE guest_id = v_new_guest_id;
        
        GET DIAGNOSTICS v_posts_merged = ROW_COUNT;
        RAISE NOTICE 'Merged % posts to ANON-ASEEL', v_posts_merged;
        
        -- Transfer any comments from the duplicate guest
        UPDATE public.comments
        SET guest_id = v_aseel_id
        WHERE guest_id = v_new_guest_id;
        
        GET DIAGNOSTICS v_comments_merged = ROW_COUNT;
        RAISE NOTICE 'Merged % comments to ANON-ASEEL', v_comments_merged;
        
        -- Update post count
        UPDATE public.guests
        SET post_count = (SELECT COUNT(*) FROM posts WHERE guest_id = v_aseel_id)
        WHERE id = v_aseel_id;
        
        -- Mark the duplicate guest as merged
        UPDATE public.guests
        SET status = 'merged',
            flags = flags || ARRAY['merged_to_aseel'],
            notes = 'Merged into ANON-ASEEL on ' || NOW()::TEXT
        WHERE id = v_new_guest_id;
        
        RAISE NOTICE 'Marked duplicate guest as merged';
    ELSE
        RAISE NOTICE 'No duplicate guest found - ASEEL may need to visit the site for fingerprint capture';
    END IF;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ ANON-ASEEL fingerprint fix complete!';
    RAISE NOTICE '========================================';
END $$;

-- Verify the update
SELECT 'ANON-ASEEL after fix:' as info;
SELECT id, anonymous_id, fingerprint, status, post_count, flags, last_seen_at
FROM guests 
WHERE anonymous_id = 'ANON-ASEEL';

-- Show any merged guests
SELECT 'Merged guests:' as info;
SELECT id, anonymous_id, fingerprint, status, flags
FROM guests 
WHERE 'merged_to_aseel' = ANY(flags);
