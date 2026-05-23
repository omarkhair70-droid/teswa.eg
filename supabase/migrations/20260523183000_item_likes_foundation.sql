create table if not exists public.item_likes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(item_id, user_id)
);

alter table public.item_likes enable row level security;

drop policy if exists "item_likes_select_authenticated" on public.item_likes;
create policy "item_likes_select_authenticated"
  on public.item_likes
  for select
  to authenticated
  using (true);

drop policy if exists "item_likes_insert_own" on public.item_likes;
create policy "item_likes_insert_own"
  on public.item_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "item_likes_delete_own" on public.item_likes;
create policy "item_likes_delete_own"
  on public.item_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);
