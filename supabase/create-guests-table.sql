-- Guest User Management Schema
-- This table tracks anonymous/guest users for admin moderation
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- GUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    fingerprint TEXT NOT NULL,
    session_id TEXT,
    
    -- Optional email (if guest provides it)
    email TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    
    -- Activity metrics
    post_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    
    -- Device/Browser metadata (stored as JSON)
    device_info JSONB DEFAULT '{}'::jsonb,
    -- Example: { "userAgent": "...", "screen": "1920x1080", "timezone": "Asia/Riyadh", "language": "en-US" }
    
    -- Trust and moderation
    trust_score INTEGER DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
    flags TEXT[] DEFAULT '{}',
    -- Possible flags: 'spam', 'suspicious', 'trusted', 'verified', 'new'
    
    -- Status: active, blocked, restricted
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'restricted')),
    
    -- Timestamps
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    blocked_at TIMESTAMPTZ,
    
    -- Admin notes
    notes TEXT,
    
    -- Constraints
    UNIQUE(fingerprint)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_guests_fingerprint ON public.guests(fingerprint);
CREATE INDEX IF NOT EXISTS idx_guests_status ON public.guests(status);
CREATE INDEX IF NOT EXISTS idx_guests_email ON public.guests(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guests_last_seen ON public.guests(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_guests_trust_score ON public.guests(trust_score);

-- ============================================================================
-- UPDATE POSTS TABLE
-- ============================================================================

-- Add guest_id column to posts table to link anonymous posts to guests
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL;

-- Create index for guest posts
CREATE INDEX IF NOT EXISTS idx_posts_guest_id ON public.posts(guest_id) WHERE guest_id IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY FOR GUESTS
-- ============================================================================

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view all guests" ON public.guests;
DROP POLICY IF EXISTS "Admins can update guests" ON public.guests;
DROP POLICY IF EXISTS "Admins can delete guests" ON public.guests;
DROP POLICY IF EXISTS "Service role can insert guests" ON public.guests;
DROP POLICY IF EXISTS "Anon can insert guests" ON public.guests;

-- Only admins can view guest data
CREATE POLICY "Admins can view all guests"
    ON public.guests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Only admins can update guest data (block, flag, add notes)
CREATE POLICY "Admins can update guests"
    ON public.guests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Only admins can delete guest records
CREATE POLICY "Admins can delete guests"
    ON public.guests FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow anonymous users to create guest records (via service role or anon with restrictions)
-- Using anon role for guest creation from frontend
CREATE POLICY "Anon can insert guests"
    ON public.guests FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS FOR GUEST MANAGEMENT
-- ============================================================================

-- Function to upsert a guest record (create or update based on fingerprint)
CREATE OR REPLACE FUNCTION upsert_guest(
    p_fingerprint TEXT,
    p_session_id TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_guest_id UUID;
BEGIN
    -- Try to find existing guest by fingerprint
    SELECT id INTO v_guest_id
    FROM public.guests
    WHERE fingerprint = p_fingerprint;
    
    IF v_guest_id IS NULL THEN
        -- Create new guest
        INSERT INTO public.guests (fingerprint, session_id, email, device_info, flags)
        VALUES (p_fingerprint, p_session_id, p_email, p_device_info, ARRAY['new'])
        RETURNING id INTO v_guest_id;
    ELSE
        -- Update existing guest
        UPDATE public.guests
        SET 
            session_id = COALESCE(p_session_id, session_id),
            email = COALESCE(p_email, email),
            device_info = COALESCE(p_device_info, device_info),
            last_seen_at = NOW()
        WHERE id = v_guest_id;
    END IF;
    
    RETURN v_guest_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment guest post count
CREATE OR REPLACE FUNCTION increment_guest_post_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.guest_id IS NOT NULL THEN
        UPDATE public.guests
        SET 
            post_count = post_count + 1,
            last_seen_at = NOW()
        WHERE id = NEW.guest_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for post count
DROP TRIGGER IF EXISTS trigger_increment_guest_posts ON public.posts;
CREATE TRIGGER trigger_increment_guest_posts
    AFTER INSERT ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION increment_guest_post_count();

-- Function to decrement guest post count on delete
CREATE OR REPLACE FUNCTION decrement_guest_post_count()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.guest_id IS NOT NULL THEN
        UPDATE public.guests
        SET post_count = GREATEST(0, post_count - 1)
        WHERE id = OLD.guest_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for post deletion
DROP TRIGGER IF EXISTS trigger_decrement_guest_posts ON public.posts;
CREATE TRIGGER trigger_decrement_guest_posts
    AFTER DELETE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION decrement_guest_post_count();

-- Function to get guest statistics (admin only)
CREATE OR REPLACE FUNCTION get_guest_stats()
RETURNS TABLE (
    total_guests BIGINT,
    active_guests BIGINT,
    blocked_guests BIGINT,
    restricted_guests BIGINT,
    total_guest_posts BIGINT,
    guests_with_email BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_guests,
        COUNT(*) FILTER (WHERE status = 'active')::BIGINT as active_guests,
        COUNT(*) FILTER (WHERE status = 'blocked')::BIGINT as blocked_guests,
        COUNT(*) FILTER (WHERE status = 'restricted')::BIGINT as restricted_guests,
        COALESCE(SUM(post_count), 0)::BIGINT as total_guest_posts,
        COUNT(*) FILTER (WHERE email IS NOT NULL)::BIGINT as guests_with_email
    FROM public.guests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get posts by a specific guest (admin only)
CREATE OR REPLACE FUNCTION get_guest_posts(p_guest_id UUID)
RETURNS TABLE (
    id UUID,
    title TEXT,
    content TEXT,
    type TEXT,
    slug TEXT,
    hidden BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Access denied: Admin only';
    END IF;
    
    RETURN QUERY
    SELECT 
        p.id,
        p.title,
        p.content,
        p.type,
        p.slug,
        p.hidden,
        p.created_at
    FROM public.posts p
    WHERE p.guest_id = p_guest_id
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION upsert_guest TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_guest_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_guest_posts TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE public.guests IS 'Tracks anonymous/guest users for admin moderation';
COMMENT ON COLUMN public.guests.fingerprint IS 'Browser fingerprint hash for identifying returning guests';
COMMENT ON COLUMN public.guests.trust_score IS 'Admin-adjustable score 0-100, higher = more trusted';
COMMENT ON COLUMN public.guests.flags IS 'Array of moderation flags: spam, suspicious, trusted, verified, new';
COMMENT ON COLUMN public.guests.status IS 'Current status: active, blocked, or restricted';
