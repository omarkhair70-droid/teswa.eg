create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  notifications_enabled boolean not null default true,
  last_registered_at timestamptz not null default now(),
  disabled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_devices_user_id_idx on public.push_devices(user_id);
create index if not exists push_devices_active_user_idx on public.push_devices(user_id)
where notifications_enabled = true;

alter table public.push_devices enable row level security;

create policy "push_devices_select_own"
on public.push_devices
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.register_push_device(
  p_expo_push_token text,
  p_platform text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := btrim(coalesce(p_expo_push_token, ''));
  v_platform text := lower(btrim(coalesce(p_platform, '')));
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_token = '' then
    raise exception 'expo push token is required';
  end if;

  if v_platform not in ('android', 'ios') then
    raise exception 'platform must be android or ios';
  end if;

  insert into public.push_devices (
    user_id,
    expo_push_token,
    platform,
    notifications_enabled,
    disabled_at,
    last_registered_at,
    updated_at
  ) values (
    v_user_id,
    v_token,
    v_platform,
    true,
    null,
    now(),
    now()
  )
  on conflict (expo_push_token)
  do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    notifications_enabled = true,
    disabled_at = null,
    last_registered_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_push_device(text, text) from public;
revoke all on function public.register_push_device(text, text) from anon;
revoke all on function public.register_push_device(text, text) from authenticated;
grant execute on function public.register_push_device(text, text) to authenticated;

create or replace function public.disable_my_push_device(
  p_expo_push_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := btrim(coalesce(p_expo_push_token, ''));
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  if v_token = '' then
    return false;
  end if;

  update public.push_devices
  set notifications_enabled = false,
      disabled_at = now(),
      updated_at = now()
  where user_id = v_user_id
    and expo_push_token = v_token;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.disable_my_push_device(text) from public;
revoke all on function public.disable_my_push_device(text) from anon;
revoke all on function public.disable_my_push_device(text) from authenticated;
grant execute on function public.disable_my_push_device(text) to authenticated;
