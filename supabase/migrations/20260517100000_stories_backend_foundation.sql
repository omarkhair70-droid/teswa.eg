create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null,
  media_storage_path text not null,
  media_thumbnail_storage_path text null,
  caption text null,
  duration_ms integer null,
  width integer null,
  height integer null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint stories_media_type_check check (media_type in ('image', 'video')),
  constraint stories_caption_length_check check (caption is null or char_length(caption) <= 220),
  constraint stories_duration_positive_check check (duration_ms is null or duration_ms > 0),
  constraint stories_expires_after_created_check check (expires_at > created_at)
);

create index if not exists stories_user_id_created_at_idx
  on public.stories (user_id, created_at desc);

create index if not exists stories_expires_at_idx
  on public.stories (expires_at);

alter table public.stories enable row level security;

create policy "stories_select_active_authenticated"
on public.stories
for select
to authenticated
using (expires_at > now());

create policy "stories_insert_own_authenticated"
on public.stories
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "stories_delete_own_authenticated"
on public.stories
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('story-media', 'story-media', false)
on conflict (id)
do update set
  name = excluded.name,
  public = excluded.public;

create policy "story_media_select_active_authenticated"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'story-media'
  and exists (
    select 1
    from public.stories s
    where s.expires_at > now()
      and (
        s.media_storage_path = storage.objects.name
        or s.media_thumbnail_storage_path = storage.objects.name
      )
  )
);

create policy "story_media_insert_own_prefix"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'story-media'
  and split_part(storage.objects.name, '/', 1) = auth.uid()::text
);

create policy "story_media_delete_own_prefix"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'story-media'
  and split_part(storage.objects.name, '/', 1) = auth.uid()::text
);
