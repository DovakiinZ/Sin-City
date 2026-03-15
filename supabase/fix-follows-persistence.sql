-- Fix follows table policies to ensure persistence works
-- Run this in the Supabase SQL Editor

-- 1. Drop existing policies to be safe
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
DROP POLICY IF EXISTS "Users can follow others" ON follows;
DROP POLICY IF EXISTS "Users can unfollow" ON follows;

-- 2. Ensure RLS is enabled
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- 3. Re-create permissive SELECT policy
CREATE POLICY "Follows are viewable by everyone" ON follows
    FOR SELECT USING (true);

-- 4. Re-create INSERT policy
CREATE POLICY "Users can follow others" ON follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- 5. Re-create DELETE policy
CREATE POLICY "Users can unfollow" ON follows
    FOR DELETE USING (auth.uid() = follower_id);

-- 6. Verify indexes exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- 7. Grant permissions just in case
GRANT ALL ON follows TO service_role;
GRANT ALL ON follows TO postgres;
GRANT SELECT, INSERT, DELETE ON follows TO authenticated;
GRANT SELECT ON follows TO anon;

-- Test query (Optional - just to verify it runs without error)
SELECT count(*) FROM follows;
