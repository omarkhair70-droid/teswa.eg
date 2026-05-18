create table if not exists public.story_likes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  liker_id uuid not null references auth.users (id) on delete cascade,
  liked_at timestamptz not null default now(),
  unique (story_id, liker_id)
);

create index if not exists story_likes_story_id_liked_at_idx
  on public.story_likes (story_id, liked_at desc);

create index if not exists story_likes_liker_id_liked_at_idx
  on public.story_likes (liker_id, liked_at desc);

alter table public.story_likes enable row level security;

create policy story_likes_insert_authenticated_non_owner
on public.story_likes
for insert
to authenticated
with check (
  liker_id = auth.uid()
  and exists (
    select 1
    from public.stories s
    where s.id = story_likes.story_id
      and s.expires_at > now()
      and s.user_id <> auth.uid()
  )
);

create policy story_likes_delete_own
on public.story_likes
for delete
to authenticated
using (
  liker_id = auth.uid()
);

create policy story_likes_select_liker_or_story_owner
on public.story_likes
for select
to authenticated
using (
  liker_id = auth.uid()
  or exists (
    select 1
    from public.stories s
    where s.id = story_likes.story_id
      and s.user_id = auth.uid()
  )
);
