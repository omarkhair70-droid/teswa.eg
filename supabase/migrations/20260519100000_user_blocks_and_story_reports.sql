create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_unique unique (blocker_id, blocked_user_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_user_id)
);

create index if not exists user_blocks_blocker_id_idx on public.user_blocks(blocker_id);
create index if not exists user_blocks_blocked_user_id_idx on public.user_blocks(blocked_user_id);
create index if not exists user_blocks_lookup_idx on public.user_blocks(blocker_id, blocked_user_id);

alter table public.user_blocks enable row level security;

create policy user_blocks_select_own on public.user_blocks
for select to authenticated
using (blocker_id = auth.uid());

create policy user_blocks_insert_own on public.user_blocks
for insert to authenticated
with check (blocker_id = auth.uid());

create policy user_blocks_delete_own on public.user_blocks
for delete to authenticated
using (blocker_id = auth.uid());

alter table public.reports
  add column if not exists story_id uuid null references public.stories(id) on delete set null;

create index if not exists reports_story_id_idx on public.reports(story_id);
