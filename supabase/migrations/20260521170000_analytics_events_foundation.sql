create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references public.profiles(id) on delete set null,
  session_id text not null,
  event_name text not null,
  source text not null default 'mobile',
  route text null,
  entity_type text null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  app_version text null,
  platform text null,
  created_at timestamptz not null default now(),
  constraint analytics_events_event_name_len check (char_length(event_name) between 1 and 80),
  constraint analytics_events_source_len check (char_length(source) between 1 and 40),
  constraint analytics_events_route_len check (route is null or char_length(route) <= 200),
  constraint analytics_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_user_created_idx on public.analytics_events (user_id, created_at desc);
create index if not exists analytics_events_name_created_idx on public.analytics_events (event_name, created_at desc);
create index if not exists analytics_events_entity_idx on public.analytics_events (entity_type, entity_id) where entity_id is not null;

alter table public.analytics_events enable row level security;

create policy "analytics insert own"
on public.analytics_events
for insert
to authenticated
with check (user_id = auth.uid());

create or replace function public.track_analytics_event(
  p_event_name text,
  p_session_id text,
  p_route text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_app_version text default null,
  p_platform text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_blocked_keys text[] := array['body','message','note','description','email','phone','token','secret','password','push_token'];
  v_key text;
  v_allowed_events text[] := array[
    'app_opened','session_started','auth_gate_viewed','home_viewed','search_viewed','item_detail_viewed',
    'item_create_started','item_published','offer_started','offer_sent','offer_action_taken','deal_room_viewed',
    'deal_message_sent','notification_opened','story_viewed','story_reply_started','profile_viewed'
  ];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  if p_event_name is null or not (p_event_name = any(v_allowed_events)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event');
  end if;

  if p_session_id is null or char_length(trim(p_session_id)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_session');
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_metadata');
  end if;

  foreach v_key in array v_blocked_keys loop
    v_metadata := v_metadata - v_key;
  end loop;

  insert into public.analytics_events (
    user_id, session_id, event_name, source, route, entity_type, entity_id, metadata, app_version, platform
  ) values (
    v_user_id, p_session_id, p_event_name, 'mobile', p_route, p_entity_type, p_entity_id, v_metadata, p_app_version, p_platform
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.track_analytics_event(text, text, text, text, uuid, jsonb, text, text) to authenticated;
