create table if not exists public.dolab_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  description text,
  category text,
  condition text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'published', 'exchanged', 'archived')),
  source text not null default 'manual' check (source in ('manual', 'camera', 'gallery', 'share_intent', 'note', 'voice')),
  published_item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dolab_items_user_id_idx on public.dolab_items (user_id);
create index if not exists dolab_items_status_idx on public.dolab_items (status);
create index if not exists dolab_items_created_at_desc_idx on public.dolab_items (created_at desc);
create index if not exists dolab_items_published_item_id_idx on public.dolab_items (published_item_id);

create table if not exists public.dolab_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dolab_item_id uuid references public.dolab_items(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'audio')),
  storage_path text not null,
  thumbnail_path text,
  duration_ms integer,
  width integer,
  height integer,
  mime_type text,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists dolab_media_user_id_idx on public.dolab_media (user_id);
create index if not exists dolab_media_dolab_item_id_idx on public.dolab_media (dolab_item_id);
create index if not exists dolab_media_media_type_idx on public.dolab_media (media_type);
create index if not exists dolab_media_created_at_desc_idx on public.dolab_media (created_at desc);

create table if not exists public.dolab_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dolab_item_id uuid references public.dolab_items(id) on delete cascade,
  note_type text not null default 'text' check (note_type in ('text', 'voice', 'idea', 'checklist')),
  body text,
  media_id uuid references public.dolab_media(id) on delete set null,
  shared_to_conversation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dolab_notes_user_id_idx on public.dolab_notes (user_id);
create index if not exists dolab_notes_dolab_item_id_idx on public.dolab_notes (dolab_item_id);
create index if not exists dolab_notes_note_type_idx on public.dolab_notes (note_type);
create index if not exists dolab_notes_created_at_desc_idx on public.dolab_notes (created_at desc);

alter table public.dolab_items enable row level security;
alter table public.dolab_media enable row level security;
alter table public.dolab_notes enable row level security;

drop policy if exists "dolab_items_select_own" on public.dolab_items;
create policy "dolab_items_select_own" on public.dolab_items for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dolab_items_insert_own" on public.dolab_items;
create policy "dolab_items_insert_own" on public.dolab_items for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dolab_items_update_own" on public.dolab_items;
create policy "dolab_items_update_own" on public.dolab_items for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dolab_items_delete_own" on public.dolab_items;
create policy "dolab_items_delete_own" on public.dolab_items for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "dolab_media_select_own" on public.dolab_media;
create policy "dolab_media_select_own" on public.dolab_media for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dolab_media_insert_own" on public.dolab_media;
create policy "dolab_media_insert_own" on public.dolab_media for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dolab_media_update_own" on public.dolab_media;
create policy "dolab_media_update_own" on public.dolab_media for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dolab_media_delete_own" on public.dolab_media;
create policy "dolab_media_delete_own" on public.dolab_media for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "dolab_notes_select_own" on public.dolab_notes;
create policy "dolab_notes_select_own" on public.dolab_notes for select to authenticated using (auth.uid() = user_id);
drop policy if exists "dolab_notes_insert_own" on public.dolab_notes;
create policy "dolab_notes_insert_own" on public.dolab_notes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "dolab_notes_update_own" on public.dolab_notes;
create policy "dolab_notes_update_own" on public.dolab_notes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "dolab_notes_delete_own" on public.dolab_notes;
create policy "dolab_notes_delete_own" on public.dolab_notes for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('dolab-media', 'dolab-media', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "dolab_media_objects_select_own" on storage.objects;
create policy "dolab_media_objects_select_own"
on storage.objects for select to authenticated
using (bucket_id = 'dolab-media' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "dolab_media_objects_insert_own" on storage.objects;
create policy "dolab_media_objects_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'dolab-media' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "dolab_media_objects_update_own" on storage.objects;
create policy "dolab_media_objects_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'dolab-media' and auth.uid()::text = split_part(name, '/', 1))
with check (bucket_id = 'dolab-media' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "dolab_media_objects_delete_own" on storage.objects;
create policy "dolab_media_objects_delete_own"
on storage.objects for delete to authenticated
using (bucket_id = 'dolab-media' and auth.uid()::text = split_part(name, '/', 1));

create or replace function public.set_dolab_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_dolab_items_updated_at on public.dolab_items;
create trigger set_dolab_items_updated_at
before update on public.dolab_items
for each row execute procedure public.set_dolab_updated_at();

drop trigger if exists set_dolab_notes_updated_at on public.dolab_notes;
create trigger set_dolab_notes_updated_at
before update on public.dolab_notes
for each row execute procedure public.set_dolab_updated_at();
