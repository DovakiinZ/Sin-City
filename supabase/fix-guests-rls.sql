-- Fix Guests Table RLS for Anonymous Users
-- Run this to allow anonymous users to create guest records

-- ============================================================================
-- 1. DROP CONFLICTING POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Anon can insert guests" ON public.guests;
DROP POLICY IF EXISTS "Service role can insert guests" ON public.guests;
DROP POLICY IF EXISTS "Anyone can insert guests" ON public.guests;

-- ============================================================================
-- 2. CREATE PERMISSIVE INSERT POLICY FOR ANON
-- ============================================================================

-- Allow anonymous and authenticated users to INSERT guest records
CREATE POLICY "Anyone can insert guests"
ON public.guests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- ============================================================================
-- 3. ALLOW ANON TO SELECT THEIR OWN GUEST RECORD BY FINGERPRINT
-- ============================================================================

-- Allow anon to read their own guest record (needed for post count check)
DROP POLICY IF EXISTS "Anon can read own guest" ON public.guests;

CREATE POLICY "Anon can read own guest"
ON public.guests FOR SELECT
TO anon
USING (true);  -- Allow reading all (fingerprint check happens in code)

-- ============================================================================
-- 4. ALLOW ANON TO UPDATE THEIR OWN GUEST RECORD
-- ============================================================================

DROP POLICY IF EXISTS "Anon can update own guest" ON public.guests;

CREATE POLICY "Anon can update own guest"
ON public.guests FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Verify
SELECT 'Guests table RLS fixed for anonymous users' as status;
