-- Consolidate posts SELECT visibility into ONE authoritative policy.
--
-- Why: Multiple migrations each created their own permissive SELECT policy
-- ("Posts are readable by anyone" in add-soft-delete-to-posts.sql,
--  "Selective post visibility" in add-registered-only-toggle.sql, etc.).
-- Postgres OR-combines permissive policies for the same command, so:
--   * rows were leaking (a deleted post stayed visible because a *different*
--     policy's clause was satisfied), and
--   * the "= false" clauses silently dropped rows where the flag was NULL.
--
-- Rule we want: a post is visible if it is NOT deleted, NOT removed (hidden),
-- and NOT a draft -- with registered-only posts gated to logged-in users.
-- Authors always see their own posts; admins/ceo see everything.
--
-- Run this in the Supabase SQL editor. Safe to re-run (idempotent).

-- Drop every known older SELECT policy so only the consolidated one remains.
drop policy if exists "Posts are readable by anyone"        on public.posts;
drop policy if exists "Selective post visibility"           on public.posts;
drop policy if exists "Public posts are viewable by everyone" on public.posts;
drop policy if exists "posts_select_public"                 on public.posts;
drop policy if exists "posts_select_own_drafts"             on public.posts;

create policy "posts_select_public"
  on public.posts
  for select
  using (
    -- Author sees their own posts (including drafts / soft-deleted).
    (auth.uid() = user_id)
    -- Admins / CEO see everything.
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.role in ('admin', 'ceo')
    )
    -- Everyone else: visible unless deleted, removed, or draft.
    -- coalesce(..., false) keeps NULL-flag rows visible.
    or (
      coalesce(is_deleted, false) = false
      and coalesce(hidden, false) = false
      and coalesce(draft, false) = false
      and (
        coalesce(is_registered_only, false) = false
        or auth.role() = 'authenticated'
      )
    )
  );

-- Sanity check after running (should return every public, non-deleted post):
-- select count(*) from public.posts
-- where coalesce(is_deleted,false)=false
--   and coalesce(hidden,false)=false
--   and coalesce(draft,false)=false;
