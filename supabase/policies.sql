-- ==========================================
-- SUPABASE STORAGE POLICIES (Fix Uploads)
-- ==========================================

-- 1. Create 'media' bucket if it doesn't exist
-- We make it public so files can be accessed via public URL
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- 2. Drop existing policies to avoid conflicts/duplicates
-- (It's safe to drop if they don't exist, doing it carefully)
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Allow Uploads" on storage.objects;
drop policy if exists "Allow Public Uploads" on storage.objects;
drop policy if exists "Give me uploads" on storage.objects;

-- 3. Policy: EVERYONE can READ (Select)
-- Necessary for the feed to display images
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'media' );

-- 4. Policy: EVERYONE can UPLOAD (Insert)
-- This allows both logged-in users and anonymous visitors to upload
create policy "Allow Public Uploads"
on storage.objects for insert
with check ( bucket_id = 'media' );

-- Note: We generally don't allow anonymous DELETE/UPDATE to prevent griefing.
-- Authenticated users could get a DELETE policy if needed later.
