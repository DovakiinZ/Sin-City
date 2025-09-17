-- Run this SQL in your Supabase project's SQL editor
-- Enable UUID generation if needed
-- create extension if not exists "uuid-ossp";

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('Text','Image','Video','Link')),
  content text,
  attachments jsonb,
  author_name text,
  author_email text,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table public.posts enable row level security;

-- Read for everyone (public blog)
create policy if not exists "Posts are readable by anyone"
  on public.posts for select
  using (true);

-- Demo insert policy: allow anon to insert
-- WARNING: for demos only. In production, use Supabase Auth and restrict to authenticated users.
create policy if not exists "Anyone can insert posts (demo)"
  on public.posts for insert
  with check (true);

-- Optional: only author can update/delete their own posts once Auth is wired
-- create policy "Authors can update their posts" on public.posts for update using (auth.role() = 'authenticated');
-- create policy "Authors can delete their posts" on public.posts for delete using (auth.role() = 'authenticated');

