-- Secure policies: authenticated-only writes and ownership
-- Run after schema.sql has been applied

-- Ensure pgcrypto for gen_random_uuid
create extension if not exists pgcrypto;

-- Add user_id column for ownership (if not present)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'user_id'
  ) then
    alter table public.posts add column user_id uuid references auth.users(id);
  end if;
end $$;

-- Keep public read access
create policy if not exists "Posts are readable by anyone"
  on public.posts for select using (true);

-- Remove demo anon insert policy if it exists
do $$
begin
  if exists (
    select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='Anyone can insert posts (demo)'
  ) then
    drop policy "Anyone can insert posts (demo)" on public.posts;
  end if;
end $$;

-- Only authenticated users can insert; require user_id matches auth.uid()
create policy if not exists "Authenticated can insert with matching user_id"
  on public.posts for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

-- Only owner may update/delete their rows (optional tighten)
create policy if not exists "Owner can update"
  on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy if not exists "Owner can delete"
  on public.posts for delete using (auth.uid() = user_id);

