create table if not exists public.item_videos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  video_storage_path text not null,
  duration_ms integer null,
  width integer null,
  height integer null,
  created_at timestamptz not null default now(),
  constraint item_videos_item_id_key unique (item_id),
  constraint item_videos_duration_positive_check check (duration_ms is null or duration_ms > 0),
  constraint item_videos_width_positive_check check (width is null or width > 0),
  constraint item_videos_height_positive_check check (height is null or height > 0)
);

create index if not exists item_videos_item_id_idx
  on public.item_videos (item_id);

alter table public.item_videos enable row level security;

create policy "item_videos_select_active_public"
on public.item_videos
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.items i
    left join public.profiles p on p.id = i.owner_id
    where i.id = item_videos.item_id
      and i.status = 'active'
      and coalesce(p.is_banned, false) = false
  )
);

create policy "item_videos_insert_own_item_authenticated"
on public.item_videos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.items i
    where i.id = item_videos.item_id
      and i.owner_id = auth.uid()
  )
);

create policy "item_videos_update_own_item_authenticated"
on public.item_videos
for update
to authenticated
using (
  exists (
    select 1
    from public.items i
    where i.id = item_videos.item_id
      and i.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.items i
    where i.id = item_videos.item_id
      and i.owner_id = auth.uid()
  )
);

create policy "item_videos_delete_own_item_authenticated"
on public.item_videos
for delete
to authenticated
using (
  exists (
    select 1
    from public.items i
    where i.id = item_videos.item_id
      and i.owner_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-videos',
  'item-videos',
  false,
  52428800,
  array['video/mp4', 'video/quicktime', 'video/mov', 'video/x-m4v', 'video/webm']
)
on conflict (id)
do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "item_videos_storage_select_active_public"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'item-videos'
  and exists (
    select 1
    from public.item_videos iv
    join public.items i on i.id = iv.item_id
    left join public.profiles p on p.id = i.owner_id
    where iv.video_storage_path = storage.objects.name
      and i.status = 'active'
      and coalesce(p.is_banned, false) = false
  )
);

create policy "item_videos_storage_insert_own_prefix"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'item-videos'
  and split_part(storage.objects.name, '/', 1) = auth.uid()::text
);

create policy "item_videos_storage_update_own_prefix"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'item-videos'
  and split_part(storage.objects.name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'item-videos'
  and split_part(storage.objects.name, '/', 1) = auth.uid()::text
);

create policy "item_videos_storage_delete_own_prefix"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'item-videos'
  and split_part(storage.objects.name, '/', 1) = auth.uid()::text
);
