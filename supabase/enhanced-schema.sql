-- Enhanced Supabase Schema for Sin City Blog
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ============================================================================
-- POSTS TABLE (Enhanced)
-- ============================================================================

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  type text not null check (type in ('Text','Image','Video','Link')),
  content text,
  slug text unique,
  attachments jsonb,
  tags text[],
  draft boolean default false,
  author_name text,
  author_email text,
  view_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for performance
create index if not exists idx_posts_user_id on public.posts(user_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_posts_slug on public.posts(slug);
create index if not exists idx_posts_draft on public.posts(draft);

-- ============================================================================
-- COMMENTS TABLE
-- ============================================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  author_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for performance
create index if not exists idx_comments_post_id on public.comments(post_id);
create index if not exists idx_comments_user_id on public.comments(user_id);
create index if not exists idx_comments_created_at on public.comments(created_at desc);

-- ============================================================================
-- REACTIONS TABLE
-- ============================================================================

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('+1', '!', '*', '#')),
  created_at timestamptz not null default now(),
  unique(post_id, user_id, reaction_type)
);

-- Create index for performance
create index if not exists idx_reactions_post_id on public.reactions(post_id);
create index if not exists idx_reactions_user_id on public.reactions(user_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;

-- POSTS POLICIES
-- Read: Everyone can read published posts, owners can read drafts
drop policy if exists "Posts are readable by anyone" on public.posts;
drop policy if exists "Anyone can insert posts (demo)" on public.posts;

create policy "Published posts readable by anyone"
  on public.posts for select
  using (draft = false or auth.uid() = user_id);

-- Insert: Authenticated users only
create policy "Authenticated users can insert posts"
  on public.posts for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

-- Update: Only post owner
create policy "Users can update own posts"
  on public.posts for update
  using (auth.uid() = user_id);

-- Delete: Only post owner
create policy "Users can delete own posts"
  on public.posts for delete
  using (auth.uid() = user_id);

-- COMMENTS POLICIES
-- Read: Everyone can read comments
create policy "Comments readable by anyone"
  on public.comments for select
  using (true);

-- Insert: Authenticated users only
create policy "Authenticated users can comment"
  on public.comments for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

-- Update: Only comment owner
create policy "Users can update own comments"
  on public.comments for update
  using (auth.uid() = user_id);

-- Delete: Only comment owner
create policy "Users can delete own comments"
  on public.comments for delete
  using (auth.uid() = user_id);

-- REACTIONS POLICIES
-- Read: Everyone can read reactions
create policy "Reactions readable by anyone"
  on public.reactions for select
  using (true);

-- Insert: Authenticated users only
create policy "Authenticated users can react"
  on public.reactions for insert
  with check (auth.role() = 'authenticated' and user_id = auth.uid());

-- Delete: Only reaction owner (to toggle reactions)
create policy "Users can delete own reactions"
  on public.reactions for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update timestamp function
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply triggers
drop trigger if exists update_posts_updated_at on public.posts;
create trigger update_posts_updated_at 
  before update on public.posts
  for each row execute procedure update_updated_at_column();

drop trigger if exists update_comments_updated_at on public.comments;
create trigger update_comments_updated_at 
  before update on public.comments
  for each row execute procedure update_updated_at_column();

-- Increment view count function
create or replace function increment_post_views(post_uuid uuid)
returns void as $$
begin
  update public.posts
  set view_count = view_count + 1
  where id = post_uuid;
end;
$$ language plpgsql security definer;

-- Get post with comment count
create or replace function get_posts_with_counts()
returns table (
  id uuid,
  user_id uuid,
  title text,
  type text,
  content text,
  slug text,
  attachments jsonb,
  tags text[],
  draft boolean,
  author_name text,
  author_email text,
  view_count integer,
  comment_count bigint,
  created_at timestamptz,
  updated_at timestamptz
) as $$
begin
  return query
  select 
    p.*,
    count(c.id) as comment_count
  from public.posts p
  left join public.comments c on c.post_id = p.id
  group by p.id
  order by p.created_at desc;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================

-- Note: Run these commands in Supabase Dashboard > Database > Replication
-- or via SQL if you have the proper permissions

-- Enable realtime for posts
-- alter publication supabase_realtime add table public.posts;

-- Enable realtime for comments  
-- alter publication supabase_realtime add table public.comments;

-- Enable realtime for reactions
-- alter publication supabase_realtime add table public.reactions;

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================

-- Uncomment to insert sample data
/*
insert into public.posts (title, type, content, draft, author_name, author_email)
values 
  ('Welcome to Sin City', 'Text', '# Welcome\n\nThis is a sample post.', false, 'Admin', 'admin@sincity.dev'),
  ('ASCII Art Tutorial', 'Text', 'Learn how to create ASCII art...', false, 'Dovakiin', 'v4xd@outlook.sa');
*/
