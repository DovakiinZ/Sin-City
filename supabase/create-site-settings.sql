-- ============================================================================
-- NUCLEAR RLS FIX: Pure Strict Enforcement
-- ============================================================================
-- This script WIPES all policies on the posts table and reapplies 
-- ONLY the necessary ones. This is the only way to ensure 100% compliance.
-- ============================================================================

DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    -- 1. DROP ALL existing policies on the posts table to ensure a clean slate
    FOR pol IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'posts' AND schemaname = 'public'
    ) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts', pol.policyname);
    END LOOP;
END $$;

-- 2. ENABLE RLS (just in case)
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- 3. RE-APPLY READ POLICY (Everyone can read posts)
CREATE POLICY "Anyone can view posts"
    ON public.posts FOR SELECT
    USING (true);

-- 4. RE-APPLY STRICT INSERT POLICY
-- This is the core logic for the toggle
CREATE POLICY "Controlled post insertion"
    ON public.posts FOR INSERT
    WITH CHECK (
        -- Scenario A: Authenticated users (logged in)
        auth.role() = 'authenticated'
        OR
        -- Scenario B: Anonymous guests (checked against site_settings)
        (
            EXISTS (
                SELECT 1 FROM public.site_settings 
                WHERE id = 'allow_anonymous_posts' 
                AND (
                    -- Handles both boolean jsonb and string "true" jsonb
                    (value::text = 'true') OR 
                    (value#>>'{}' = 'true')
                )
            )
        )
    );

-- 5. RE-APPLY ADMIN DELETE POLICY
CREATE POLICY "Admins can delete all posts"
    ON public.posts FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 6. RE-APPLY USER DELETE POLICY (Self-cleanup)
CREATE POLICY "Users can delete own posts"
    ON public.posts FOR DELETE
    USING (auth.uid() = user_id);

-- 7. RE-APPLY UPDATE POLICY (Admins/Authors)
CREATE POLICY "Admins and authors can update posts"
    ON public.posts FOR UPDATE
    USING (
        (auth.uid() = user_id)
        OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 8. Final verification check - Look for policy count (should be 5)
SELECT 
    policyname, 
    cmd, 
    roles, 
    qual, 
    with_check 
FROM pg_policies 
WHERE tablename = 'posts' 
ORDER BY cmd, policyname;
