-- Guest Intelligence System - Enhanced Schema
-- Run this in your Supabase SQL Editor to upgrade the guests table

-- ============================================================================
-- EXTEND GUESTS TABLE WITH INTELLIGENCE FIELDS
-- ============================================================================

-- Enhanced fingerprint fields
ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT,
ADD COLUMN IF NOT EXISTS device_memory INTEGER,
ADD COLUMN IF NOT EXISTS hardware_concurrency INTEGER;

-- IP & Network data (server-side captured, privacy-safe)
ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS ip_hash TEXT,
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS isp TEXT,
ADD COLUMN IF NOT EXISTS vpn_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tor_detected BOOLEAN DEFAULT FALSE;

-- Email enhancements
ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS disposable_email_detected BOOLEAN DEFAULT FALSE;

-- Behavior tracking
ALTER TABLE public.guests 
ADD COLUMN IF NOT EXISTS posts_per_hour NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_time_between_posts INTEGER,
ADD COLUMN IF NOT EXISTS last_focus_time INTEGER,
ADD COLUMN IF NOT EXISTS copy_paste_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_post_at TIMESTAMPTZ;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_guests_ip_hash ON public.guests(ip_hash) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_country ON public.guests(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_vpn ON public.guests(vpn_detected) WHERE vpn_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_guests_tor ON public.guests(tor_detected) WHERE tor_detected = TRUE;

-- ============================================================================
-- UPDATE POSTS TABLE FOR AUTHOR TYPE
-- ============================================================================

ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS author_type TEXT DEFAULT 'user' CHECK (author_type IN ('user', 'guest'));

-- Update existing posts to set author_type based on user_id/guest_id
UPDATE public.posts 
SET author_type = CASE 
    WHEN user_id IS NOT NULL THEN 'user'
    WHEN guest_id IS NOT NULL THEN 'guest'
    ELSE 'guest'
END
WHERE author_type IS NULL OR author_type = 'user';

-- Create index for author_type
CREATE INDEX IF NOT EXISTS idx_posts_author_type ON public.posts(author_type);

-- ============================================================================
-- TRUST SCORE CALCULATION FUNCTION
-- ============================================================================

-- Function to recalculate trust score based on all factors
CREATE OR REPLACE FUNCTION calculate_guest_trust_score(p_guest_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_score INTEGER := 50;  -- Base score
    v_guest RECORD;
BEGIN
    -- Get guest data
    SELECT * INTO v_guest FROM public.guests WHERE id = p_guest_id;
    
    IF NOT FOUND THEN
        RETURN 50;
    END IF;
    
    -- Positive factors
    IF v_guest.email_verified THEN
        v_score := v_score + 20;
    END IF;
    
    IF v_guest.email IS NOT NULL AND NOT v_guest.email_verified THEN
        v_score := v_score + 5;  -- Provided email but not verified
    END IF;
    
    IF v_guest.post_count >= 5 THEN
        v_score := v_score + 10;  -- Established guest
    END IF;
    
    IF 'trusted' = ANY(v_guest.flags) THEN
        v_score := v_score + 15;  -- Manually trusted
    END IF;
    
    -- Negative factors
    IF v_guest.vpn_detected THEN
        v_score := v_score - 15;
    END IF;
    
    IF v_guest.tor_detected THEN
        v_score := v_score - 20;
    END IF;
    
    IF v_guest.disposable_email_detected THEN
        v_score := v_score - 10;
    END IF;
    
    IF v_guest.posts_per_hour > 3 THEN
        v_score := v_score - 20;  -- Rapid posting
    ELSIF v_guest.posts_per_hour > 2 THEN
        v_score := v_score - 10;
    END IF;
    
    IF 'spam' = ANY(v_guest.flags) THEN
        v_score := v_score - 30;
    END IF;
    
    IF 'suspicious' = ANY(v_guest.flags) THEN
        v_score := v_score - 15;
    END IF;
    
    -- Clamp to 0-100
    v_score := GREATEST(0, LEAST(100, v_score));
    
    RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update trust score and auto-set flags
CREATE OR REPLACE FUNCTION update_guest_trust_and_flags(p_guest_id UUID)
RETURNS VOID AS $$
DECLARE
    v_score INTEGER;
    v_new_flags TEXT[];
    v_guest RECORD;
BEGIN
    -- Calculate new score
    v_score := calculate_guest_trust_score(p_guest_id);
    
    -- Get current guest
    SELECT * INTO v_guest FROM public.guests WHERE id = p_guest_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Start with manually set flags (keep trusted/verified if admin set them)
    v_new_flags := ARRAY[]::TEXT[];
    
    IF 'trusted' = ANY(v_guest.flags) THEN
        v_new_flags := array_append(v_new_flags, 'trusted');
    END IF;
    
    IF 'verified' = ANY(v_guest.flags) THEN
        v_new_flags := array_append(v_new_flags, 'verified');
    END IF;
    
    -- Auto-flags based on behavior
    IF v_guest.post_count < 3 THEN
        v_new_flags := array_append(v_new_flags, 'new');
    END IF;
    
    IF v_score < 15 AND NOT ('spam' = ANY(v_guest.flags)) THEN
        v_new_flags := array_append(v_new_flags, 'spam');
    ELSIF v_score < 30 AND NOT ('suspicious' = ANY(v_guest.flags)) THEN
        v_new_flags := array_append(v_new_flags, 'suspicious');
    END IF;
    
    -- Update guest
    UPDATE public.guests 
    SET 
        trust_score = v_score,
        flags = v_new_flags
    WHERE id = p_guest_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- UPDATE BEHAVIOR METRICS ON POST
-- ============================================================================

-- Enhanced function to update guest stats after posting
CREATE OR REPLACE FUNCTION update_guest_post_behavior()
RETURNS TRIGGER AS $$
DECLARE
    v_last_post_at TIMESTAMPTZ;
    v_posts_in_hour INTEGER;
    v_avg_time INTEGER;
BEGIN
    IF NEW.guest_id IS NOT NULL THEN
        -- Get last post time
        SELECT last_post_at INTO v_last_post_at 
        FROM public.guests WHERE id = NEW.guest_id;
        
        -- Count posts in last hour
        SELECT COUNT(*) INTO v_posts_in_hour
        FROM public.posts
        WHERE guest_id = NEW.guest_id
        AND created_at > NOW() - INTERVAL '1 hour';
        
        -- Calculate average time between posts (simplified)
        SELECT EXTRACT(EPOCH FROM AVG(created_at - lag_created_at))::INTEGER
        INTO v_avg_time
        FROM (
            SELECT created_at, LAG(created_at) OVER (ORDER BY created_at) as lag_created_at
            FROM public.posts
            WHERE guest_id = NEW.guest_id
            ORDER BY created_at DESC
            LIMIT 10
        ) subq
        WHERE lag_created_at IS NOT NULL;
        
        -- Update guest
        UPDATE public.guests
        SET 
            post_count = post_count + 1,
            posts_per_hour = v_posts_in_hour,
            avg_time_between_posts = COALESCE(v_avg_time, 0),
            last_post_at = NOW(),
            last_seen_at = NOW()
        WHERE id = NEW.guest_id;
        
        -- Recalculate trust score
        PERFORM update_guest_trust_and_flags(NEW.guest_id);
    END IF;
    
    -- Set author_type
    IF NEW.author_type IS NULL THEN
        NEW.author_type := CASE 
            WHEN NEW.user_id IS NOT NULL THEN 'user'
            ELSE 'guest'
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace the old trigger
DROP TRIGGER IF EXISTS trigger_increment_guest_posts ON public.posts;
DROP TRIGGER IF EXISTS trigger_update_guest_behavior ON public.posts;

CREATE TRIGGER trigger_update_guest_behavior
    BEFORE INSERT ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION update_guest_post_behavior();

-- ============================================================================
-- LIST OF KNOWN DISPOSABLE EMAIL DOMAINS
-- ============================================================================

-- Simple table for disposable email domains (can be extended)
CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
    domain TEXT PRIMARY KEY
);

-- Insert common disposable domains
INSERT INTO public.disposable_email_domains (domain) VALUES
    ('tempmail.com'),
    ('throwaway.email'),
    ('guerrillamail.com'),
    ('mailinator.com'),
    ('10minutemail.com'),
    ('temp-mail.org'),
    ('fakeinbox.com'),
    ('trashmail.com'),
    ('yopmail.com'),
    ('sharklasers.com'),
    ('guerrillamail.info'),
    ('grr.la'),
    ('pokemail.net'),
    ('spam4.me'),
    ('dispostable.com')
ON CONFLICT DO NOTHING;

-- Function to check if email is disposable
CREATE OR REPLACE FUNCTION is_disposable_email(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_domain TEXT;
BEGIN
    IF p_email IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Extract domain
    v_domain := split_part(p_email, '@', 2);
    
    IF v_domain = '' THEN
        RETURN FALSE;
    END IF;
    
    -- Check against known disposable domains
    RETURN EXISTS (
        SELECT 1 FROM public.disposable_email_domains 
        WHERE domain = lower(v_domain)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ENHANCED UPSERT GUEST FUNCTION
-- ============================================================================

-- Drop old function first
DROP FUNCTION IF EXISTS upsert_guest(TEXT, TEXT, TEXT, JSONB);

-- Enhanced upsert with all new fields
CREATE OR REPLACE FUNCTION upsert_guest(
    p_fingerprint TEXT,
    p_fingerprint_hash TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb,
    p_device_memory INTEGER DEFAULT NULL,
    p_hardware_concurrency INTEGER DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_country TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_isp TEXT DEFAULT NULL,
    p_vpn_detected BOOLEAN DEFAULT FALSE,
    p_tor_detected BOOLEAN DEFAULT FALSE,
    p_focus_time INTEGER DEFAULT NULL,
    p_copy_paste_count INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_guest_id UUID;
    v_is_disposable BOOLEAN := FALSE;
BEGIN
    -- Check if email is disposable
    IF p_email IS NOT NULL THEN
        v_is_disposable := is_disposable_email(p_email);
    END IF;
    
    -- Try to find existing guest by fingerprint
    SELECT id INTO v_guest_id
    FROM public.guests
    WHERE fingerprint = p_fingerprint;
    
    IF v_guest_id IS NULL THEN
        -- Create new guest
        INSERT INTO public.guests (
            fingerprint, 
            fingerprint_hash,
            session_id, 
            email, 
            device_info, 
            device_memory,
            hardware_concurrency,
            ip_hash,
            country,
            city,
            isp,
            vpn_detected,
            tor_detected,
            disposable_email_detected,
            last_focus_time,
            copy_paste_count,
            flags
        )
        VALUES (
            p_fingerprint, 
            p_fingerprint_hash,
            p_session_id, 
            p_email, 
            p_device_info, 
            p_device_memory,
            p_hardware_concurrency,
            p_ip_hash,
            p_country,
            p_city,
            p_isp,
            p_vpn_detected,
            p_tor_detected,
            v_is_disposable,
            p_focus_time,
            COALESCE(p_copy_paste_count, 0),
            ARRAY['new']
        )
        RETURNING id INTO v_guest_id;
    ELSE
        -- Update existing guest
        UPDATE public.guests
        SET 
            fingerprint_hash = COALESCE(p_fingerprint_hash, fingerprint_hash),
            session_id = COALESCE(p_session_id, session_id),
            email = COALESCE(p_email, email),
            device_info = COALESCE(p_device_info, device_info),
            device_memory = COALESCE(p_device_memory, device_memory),
            hardware_concurrency = COALESCE(p_hardware_concurrency, hardware_concurrency),
            ip_hash = COALESCE(p_ip_hash, ip_hash),
            country = COALESCE(p_country, country),
            city = COALESCE(p_city, city),
            isp = COALESCE(p_isp, isp),
            vpn_detected = COALESCE(p_vpn_detected, vpn_detected),
            tor_detected = COALESCE(p_tor_detected, tor_detected),
            disposable_email_detected = CASE 
                WHEN p_email IS NOT NULL THEN v_is_disposable 
                ELSE disposable_email_detected 
            END,
            last_focus_time = COALESCE(p_focus_time, last_focus_time),
            copy_paste_count = copy_paste_count + COALESCE(p_copy_paste_count, 0),
            last_seen_at = NOW()
        WHERE id = v_guest_id;
        
        -- Recalculate trust score
        PERFORM update_guest_trust_and_flags(v_guest_id);
    END IF;
    
    RETURN v_guest_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION upsert_guest TO anon, authenticated;
GRANT EXECUTE ON FUNCTION calculate_guest_trust_score TO authenticated;
GRANT EXECUTE ON FUNCTION update_guest_trust_and_flags TO authenticated;
GRANT EXECUTE ON FUNCTION is_disposable_email TO anon, authenticated;

-- Comments
COMMENT ON FUNCTION calculate_guest_trust_score IS 'Calculate dynamic trust score for a guest based on behavior and attributes';
COMMENT ON FUNCTION update_guest_trust_and_flags IS 'Update trust score and auto-set flags based on behavior';
COMMENT ON FUNCTION is_disposable_email IS 'Check if email domain is a known disposable email provider';
