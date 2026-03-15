-- ============================================================================
-- ACTIVITY LOGS TABLE
-- Universal action tracking for complete traceability
-- Every action has exactly ONE identity: user OR anon, never both, never none
-- ============================================================================

-- Create the activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- =========================================================================
    -- ACTOR IDENTITY (REQUIRED - No ghost users!)
    -- Every request resolves to exactly ONE identity
    -- =========================================================================
    actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'anon')),
    actor_id UUID NOT NULL,  -- References profiles.id if user, guests.id if anon
    
    -- =========================================================================
    -- ACTION DETAILS
    -- =========================================================================
    action TEXT NOT NULL CHECK (action IN (
        'visit',           -- First visit / page load
        'page_view',       -- Viewing a specific page
        'post_create',     -- Created a post
        'post_view',       -- Viewed a post
        'post_edit',       -- Edited a post
        'post_delete',     -- Deleted a post
        'comment_create',  -- Created a comment
        'comment_edit',    -- Edited a comment
        'comment_delete',  -- Deleted a comment
        'like',            -- Liked content
        'unlike',          -- Removed like
        'dm_send',         -- Sent direct message
        'dm_read',         -- Read direct message
        'follow',          -- Followed a user
        'unfollow',        -- Unfollowed a user
        'login',           -- User logged in
        'logout',          -- User logged out
        'register',        -- User registered
        'merge',           -- Anon merged to user
        'identity_resolve' -- Identity was resolved/assigned
    )),
    
    -- Target of the action (optional - some actions like 'visit' have no target)
    target_type TEXT CHECK (target_type IN ('post', 'comment', 'profile', 'page', 'message', 'anon', NULL)),
    target_id UUID,                -- ID of the target entity
    target_metadata JSONB,         -- Additional context (page URL, post slug, etc.)
    
    -- =========================================================================
    -- SECURITY CONTEXT (Server-captured, admin-only)
    -- =========================================================================
    ip_address TEXT,               -- Plain IP (admin-only via RLS)
    ip_hash TEXT,                  -- SHA256 hash for correlation
    user_agent TEXT,
    device_info JSONB,             -- {browser, os, device_type, screen, etc.}
    geo_info JSONB,                -- {country, city, isp, vpn_detected, tor_detected}
    
    -- =========================================================================
    -- SESSION CONTEXT
    -- =========================================================================
    session_id TEXT,               -- Browser session identifier
    referrer TEXT,                 -- Where did they come from
    page_url TEXT,                 -- Current page URL
    
    -- =========================================================================
    -- TIMESTAMPS
    -- =========================================================================
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- INDEXES FOR FAST LOOKUPS
-- ============================================================================

-- Primary lookup patterns
CREATE INDEX IF NOT EXISTS idx_activity_actor 
    ON public.activity_logs(actor_type, actor_id);
    
CREATE INDEX IF NOT EXISTS idx_activity_action 
    ON public.activity_logs(action);
    
CREATE INDEX IF NOT EXISTS idx_activity_target 
    ON public.activity_logs(target_type, target_id) 
    WHERE target_id IS NOT NULL;

-- Security/Admin lookups
CREATE INDEX IF NOT EXISTS idx_activity_ip_hash 
    ON public.activity_logs(ip_hash) 
    WHERE ip_hash IS NOT NULL;
    
CREATE INDEX IF NOT EXISTS idx_activity_ip_address 
    ON public.activity_logs(ip_address) 
    WHERE ip_address IS NOT NULL;

-- Chronological queries
CREATE INDEX IF NOT EXISTS idx_activity_created_at 
    ON public.activity_logs(created_at DESC);
    
-- Combined for timeline queries
CREATE INDEX IF NOT EXISTS idx_activity_actor_timeline 
    ON public.activity_logs(actor_type, actor_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "System can insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "No updates allowed" ON public.activity_logs;
DROP POLICY IF EXISTS "No deletes allowed" ON public.activity_logs;

-- Only admins can VIEW activity logs (contains sensitive IP data)
CREATE POLICY "Admins can view activity logs" 
ON public.activity_logs FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- System can INSERT (via security definer functions)
CREATE POLICY "System can insert activity logs" 
ON public.activity_logs FOR INSERT 
WITH CHECK (true);

-- NO UPDATES ALLOWED - Activity logs are immutable
CREATE POLICY "No updates allowed" 
ON public.activity_logs FOR UPDATE 
USING (false);

-- NO DELETES ALLOWED - Activity logs are permanent
CREATE POLICY "No deletes allowed" 
ON public.activity_logs FOR DELETE 
USING (false);

-- ============================================================================
-- LOGGING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION log_activity(
    p_actor_type TEXT,
    p_actor_id UUID,
    p_action TEXT,
    p_target_type TEXT DEFAULT NULL,
    p_target_id UUID DEFAULT NULL,
    p_target_metadata JSONB DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_info JSONB DEFAULT NULL,
    p_geo_info JSONB DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_page_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.activity_logs (
        actor_type, actor_id, action,
        target_type, target_id, target_metadata,
        ip_address, ip_hash, user_agent, device_info, geo_info,
        session_id, referrer, page_url
    ) VALUES (
        p_actor_type, p_actor_id, p_action,
        p_target_type, p_target_id, p_target_metadata,
        p_ip_address, p_ip_hash, p_user_agent, p_device_info, p_geo_info,
        p_session_id, p_referrer, p_page_url
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_activity TO anon, authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.activity_logs IS 'Universal activity tracking - every action has exactly ONE identity';
COMMENT ON COLUMN public.activity_logs.actor_type IS 'Identity type: user (registered) or anon (anonymous visitor)';
COMMENT ON COLUMN public.activity_logs.actor_id IS 'References profiles.id if user, guests.id if anon';
COMMENT ON COLUMN public.activity_logs.ip_address IS 'Plain text IP - ADMIN ONLY via RLS';

SELECT 'Activity logs schema created successfully!' AS status;
