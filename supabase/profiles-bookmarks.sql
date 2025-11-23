-- User Profiles Table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  bio text,
  avatar_url text,
  ascii_avatar text,
  website text,
  location text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Bookmarks Table
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, post_id)
);

-- Indexes
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_bookmarks_user_id on public.bookmarks(user_id);
create index if not exists idx_bookmarks_post_id on public.bookmarks(post_id);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.bookmarks enable row level security;

-- Profiles Policies
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Bookmarks Policies
create policy "Users can view own bookmarks"
  on public.bookmarks for select
  using (auth.uid() = user_id);

create policy "Users can create own bookmarks"
  on public.bookmarks for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own bookmarks"
  on public.bookmarks for delete
  using (auth.uid() = user_id);

-- Triggers
drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute procedure update_updated_at_column();

-- Function to get user's post count
create or replace function get_user_post_count(user_uuid uuid)
returns integer as $$
begin
  return (
    select count(*)::integer
    from public.posts
    where user_id = user_uuid and draft = false
  );
end;
$$ language plpgsql security definer;

-- Function to get user's comment count
create or replace function get_user_comment_count(user_uuid uuid)
returns integer as $$
begin
  return (
    select count(*)::integer
    from public.comments
    where user_id = user_uuid
  );
end;
$$ language plpgsql security definer;
