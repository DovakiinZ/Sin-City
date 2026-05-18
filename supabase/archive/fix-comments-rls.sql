-- Check existing policies for comments
SELECT * FROM pg_policies WHERE tablename = 'comments';

-- Ensure RLS is enabled
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to be safe (or create if not exists, but dropping ensures clean slate)
DROP POLICY IF EXISTS "Public comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Users can insert their own comments" ON comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;

-- Create policies

-- 1. Everyone can read comments
CREATE POLICY "Public comments are viewable by everyone"
ON comments FOR SELECT
USING (true);

-- 2. Authenticated users can insert comments
CREATE POLICY "Users can insert their own comments"
ON comments FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- 3. Users can update their own comments
CREATE POLICY "Users can update their own comments"
ON comments FOR UPDATE
USING (auth.uid()::text = user_id);

-- 4. Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
ON comments FOR DELETE
USING (auth.uid()::text = user_id);
