create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);

create index if not exists story_views_story_id_viewed_at_idx
  on public.story_views (story_id, viewed_at desc);

create index if not exists story_views_viewer_id_viewed_at_idx
  on public.story_views (viewer_id, viewed_at desc);

alter table public.story_views enable row level security;

create policy story_views_insert_authenticated_non_owner
on public.story_views
for insert
to authenticated
with check (
  viewer_id = auth.uid()
  and exists (
    select 1
    from public.stories s
    where s.id = story_views.story_id
      and s.expires_at > now()
      and s.user_id <> auth.uid()
  )
);

create policy story_views_select_story_owner
on public.story_views
for select
to authenticated
using (
  exists (
    select 1
    from public.stories s
    where s.id = story_views.story_id
      and s.user_id = auth.uid()
  )
);
