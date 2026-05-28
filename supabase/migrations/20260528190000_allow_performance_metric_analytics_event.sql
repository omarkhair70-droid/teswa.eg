-- Allow sampled real-user performance metrics through the existing safe analytics RPC.
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
  v_normalized_key text;
  v_allowed_events text[] := array[
    'app_opened','session_started','auth_gate_viewed','home_viewed','search_viewed','item_detail_viewed',
    'item_create_started','item_published','offer_started','offer_sent','offer_action_taken','deal_room_viewed',
    'deal_message_sent','notification_opened','story_viewed','story_reply_started','profile_viewed','performance_metric'
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

  for v_key in select jsonb_object_keys(v_metadata) loop
    v_normalized_key := lower(v_key);
    if v_normalized_key like '%token%'
      or v_normalized_key like '%secret%'
      or v_normalized_key like '%password%'
      or v_normalized_key like '%email%'
      or v_normalized_key like '%phone%'
      or v_normalized_key like '%body%'
      or v_normalized_key like '%message%'
      or v_normalized_key like '%note%'
      or v_normalized_key like '%description%' then
      v_metadata := v_metadata - v_key;
    end if;
  end loop;

  insert into public.analytics_events (
    user_id, session_id, event_name, source, route, entity_type, entity_id, metadata, app_version, platform
  ) values (
    v_user_id, p_session_id, p_event_name, 'mobile', p_route, p_entity_type, p_entity_id, v_metadata, p_app_version, p_platform
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.track_analytics_event(text, text, text, text, uuid, jsonb, text, text) from public;
revoke all on function public.track_analytics_event(text, text, text, text, uuid, jsonb, text, text) from anon;
grant execute on function public.track_analytics_event(text, text, text, text, uuid, jsonb, text, text) to authenticated;
