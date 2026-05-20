create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  transactional_enabled boolean not null default true,
  reminders_enabled boolean not null default true,
  discovery_digest_enabled boolean not null default true,
  return_nudges_enabled boolean not null default true,
  quiet_hours_start smallint null check (quiet_hours_start between 0 and 1439),
  quiet_hours_end smallint null check (quiet_hours_end between 0 and 1439),
  timezone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.smart_notification_dispatches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  preference_category text not null check (preference_category in ('transactional', 'reminders', 'discovery_digest', 'return_nudges')),
  entity_type text null,
  entity_id uuid null,
  dedupe_key text not null,
  source text not null default 'smart_reengagement_scheduler',
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists smart_notification_dispatches_dedupe_key_idx
  on public.smart_notification_dispatches (dedupe_key);
create index if not exists smart_notification_dispatches_user_sent_idx
  on public.smart_notification_dispatches (user_id, sent_at desc);
create index if not exists smart_notification_dispatches_user_type_sent_idx
  on public.smart_notification_dispatches (user_id, notification_type, sent_at desc);

alter table public.notification_preferences enable row level security;
alter table public.smart_notification_dispatches enable row level security;

create policy notification_preferences_select_own
on public.notification_preferences
for select
using (auth.uid() = user_id);

create policy notification_preferences_insert_own
on public.notification_preferences
for insert
with check (auth.uid() = user_id);

create policy notification_preferences_update_own
on public.notification_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy smart_notification_dispatches_select_own
on public.smart_notification_dispatches
for select
using (auth.uid() = user_id);

create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute procedure public.set_notification_preferences_updated_at();

create or replace function public.get_or_create_notification_preferences()
returns public.notification_preferences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_pref public.notification_preferences;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.notification_preferences (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select * into v_pref
  from public.notification_preferences
  where user_id = v_uid;

  return v_pref;
end;
$$;

revoke all on function public.get_or_create_notification_preferences() from public;
grant execute on function public.get_or_create_notification_preferences() to authenticated;
