-- Fix Storage RLS for 'media' bucket

-- 1. Ensure the 'media' bucket is set to public
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

-- 2. Enable RLS on storage.objects (just in case)
alter table storage.objects enable row level security;

-- 3. Remove conflicting policies
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Owner Update" on storage.objects;
drop policy if exists "Owner Delete" on storage.objects;
drop policy if exists "Media Public Read" on storage.objects;
drop policy if exists "Media Auth Insert" on storage.objects;
drop policy if exists "Media Auth Update" on storage.objects;
drop policy if exists "Media Auth Delete" on storage.objects;
drop policy if exists "Give me access using title of policy" on storage.objects;

-- 4. Create comprehensive policies for 'media' bucket

-- Allow everyone to read files in the media bucket
create policy "Media Public Read"
on storage.objects for select
using ( bucket_id = 'media' );

-- Allow authenticated users to upload files to media bucket
create policy "Media Auth Insert"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'media' );

-- Allow authenticated users to update files in media bucket
create policy "Media Auth Update"
on storage.objects for update
to authenticated
using ( bucket_id = 'media' );

-- Allow authenticated users to delete files in media bucket
create policy "Media Auth Delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'media' );
