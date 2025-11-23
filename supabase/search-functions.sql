-- Add full-text search support to posts
create extension if not exists pg_trgm;

-- Add search index
create index if not exists idx_posts_search on public.posts 
using gin(to_tsvector('english', title || ' ' || coalesce(content, '')));

-- Full-text search function
create or replace function search_posts(search_query text)
returns table (
  id uuid,
  title text,
  content text,
  author_name text,
  created_at timestamptz,
  rank real
) as $$
begin
  return query
  select 
    p.id,
    p.title,
    p.content,
    p.author_name,
    p.created_at,
    ts_rank(
      to_tsvector('english', p.title || ' ' || coalesce(p.content, '')),
      plainto_tsquery('english', search_query)
    ) as rank
  from public.posts p
  where 
    p.draft = false
    and to_tsvector('english', p.title || ' ' || coalesce(p.content, ''))
    @@ plainto_tsquery('english', search_query)
  order by rank desc, p.created_at desc;
end;
$$ language plpgsql security definer;

-- Popular posts function
create or replace function get_popular_posts(limit_count integer default 10)
returns table (
  id uuid,
  title text,
  view_count integer,
  comment_count bigint,
  reaction_count bigint,
  created_at timestamptz
) as $$
begin
  return query
  select 
    p.id,
    p.title,
    p.view_count,
    count(distinct c.id) as comment_count,
    count(distinct r.id) as reaction_count,
    p.created_at
  from public.posts p
  left join public.comments c on c.post_id = p.id
  left join public.reactions r on r.post_id = p.id
  where p.draft = false
  group by p.id, p.title, p.view_count, p.created_at
  order by p.view_count desc, comment_count desc, reaction_count desc
  limit limit_count;
end;
$$ language plpgsql security definer;

-- Trending posts (recent + popular)
create or replace function get_trending_posts(days_back integer default 7, limit_count integer default 10)
returns table (
  id uuid,
  title text,
  view_count integer,
  comment_count bigint,
  reaction_count bigint,
  created_at timestamptz,
  score numeric
) as $$
begin
  return query
  select 
    p.id,
    p.title,
    p.view_count,
    count(distinct c.id) as comment_count,
    count(distinct r.id) as reaction_count,
    p.created_at,
    (p.view_count * 1.0 + count(distinct c.id) * 5.0 + count(distinct r.id) * 3.0) / 
    (extract(epoch from (now() - p.created_at)) / 86400.0 + 1.0) as score
  from public.posts p
  left join public.comments c on c.post_id = p.id
  left join public.reactions r on r.post_id = p.id
  where 
    p.draft = false
    and p.created_at > now() - interval '1 day' * days_back
  group by p.id, p.title, p.view_count, p.created_at
  order by score desc
  limit limit_count;
end;
$$ language plpgsql security definer;

-- Get all unique tags
create or replace function get_all_tags()
returns table (
  tag text,
  count bigint
) as $$
begin
  return query
  select 
    unnest(tags) as tag,
    count(*) as count
  from public.posts
  where draft = false and tags is not null
  group by tag
  order by count desc, tag asc;
end;
$$ language plpgsql security definer;
