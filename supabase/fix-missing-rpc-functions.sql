-- Fix missing RPC functions
-- Run this in Supabase SQL Editor

-- 1. Get popular posts function (simplified - no subqueries)
CREATE OR REPLACE FUNCTION get_popular_posts()
RETURNS TABLE (
    id UUID,
    title TEXT,
    view_count INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        p.id,
        p.title,
        COALESCE(p.view_count, 0) as view_count,
        p.created_at
    FROM posts p
    WHERE p.draft = false AND (p.hidden IS NULL OR p.hidden = false)
    ORDER BY COALESCE(p.view_count, 0) DESC
    LIMIT 10;
$$;

-- 2. Get trending posts function (simplified)
CREATE OR REPLACE FUNCTION get_trending_posts()
RETURNS TABLE (
    id UUID,
    title TEXT,
    view_count INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        p.id,
        p.title,
        COALESCE(p.view_count, 0) as view_count,
        p.created_at
    FROM posts p
    WHERE p.draft = false 
      AND (p.hidden IS NULL OR p.hidden = false)
      AND p.created_at > NOW() - INTERVAL '7 days'
    ORDER BY COALESCE(p.view_count, 0) DESC
    LIMIT 10;
$$;

-- 3. Get all tags function
CREATE OR REPLACE FUNCTION get_all_tags()
RETURNS TABLE (
    tag TEXT,
    count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        unnest(tags) as tag,
        COUNT(*) as count
    FROM posts
    WHERE draft = false AND (hidden IS NULL OR hidden = false)
    GROUP BY tag
    ORDER BY count DESC;
$$;
