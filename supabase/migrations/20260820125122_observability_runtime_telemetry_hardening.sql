-- PR #7: production observability contract.
-- Enables sampled performance metrics while keeping analytics authenticated-only,
-- bounded, privacy-filtered, and resistant to client-side telemetry spam.

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
  v_user_id uuid := auth.uid();
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_clean_metadata jsonb := '{}'::jsonb;
  v_allowed_events text[] := array[
    'app_opened','session_started','auth_gate_viewed','home_viewed','search_viewed','item_detail_viewed',
    'item_create_started','item_published','offer_started','offer_sent','offer_action_taken','deal_room_viewed',
    'deal_message_sent','notification_opened','story_viewed','story_reply_started','profile_viewed','performance_metric'
  ];
  v_performance_metrics text[] := array[
    'app_start_to_first_screen','auth_ready_time','home_first_content_time','direct_chat_first_message_time',
    'dolab_first_content_time','item_detail_first_content_time'
  ];
  v_performance_keys text[] := array[
    'metricName','durationMs','route','appVersion','platform','cacheHit','startType','networkState','source'
  ];
  v_key text;
  v_value jsonb;
  v_key_count integer := 0;
  v_recent_count integer := 0;
  v_recent_performance_count integer := 0;
  v_metric_name text;
  v_duration_ms numeric;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  if p_event_name is null or not (p_event_name = any(v_allowed_events)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event');
  end if;

  if p_session_id is null or char_length(btrim(p_session_id)) < 1 or char_length(p_session_id) > 128 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_session');
  end if;
  if p_route is not null and char_length(p_route) > 160 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_route');
  end if;
  if p_entity_type is not null and char_length(p_entity_type) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_entity_type');
  end if;
  if p_app_version is not null and char_length(p_app_version) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_app_version');
  end if;
  if p_platform is not null and (char_length(p_platform) > 24 or lower(p_platform) not in ('android','ios','web')) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  end if;

  if jsonb_typeof(v_metadata) <> 'object' or octet_length(v_metadata::text) > 8192 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_metadata');
  end if;

  select count(*) into v_key_count from jsonb_object_keys(v_metadata);
  if v_key_count > 24 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_metadata');
  end if;

  for v_key, v_value in select key, value from jsonb_each(v_metadata) loop
    if lower(v_key) ~ '(token|secret|password|email|phone|body|message|note|description|caption|comment|content|latitude|longitude|coordinates|gps|url|image)' then
      continue;
    end if;
    if jsonb_typeof(v_value) = 'object' then
      continue;
    end if;
    if jsonb_typeof(v_value) = 'array' then
      if jsonb_array_length(v_value) > 20 or exists (
        select 1 from jsonb_array_elements(v_value) element
        where jsonb_typeof(element) not in ('string','number','boolean','null')
      ) then
        continue;
      end if;
    end if;
    if jsonb_typeof(v_value) = 'string' and char_length(v_value #>> '{}') > 256 then
      continue;
    end if;
    v_clean_metadata := v_clean_metadata || jsonb_build_object(v_key, v_value);
  end loop;

  select count(*) into v_recent_count
  from public.analytics_events
  where user_id = v_user_id and created_at >= now() - interval '1 minute';
  if v_recent_count >= 120 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if p_event_name = 'performance_metric' then
    v_clean_metadata := (
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      from jsonb_each(v_clean_metadata)
      where key = any(v_performance_keys)
    );

    v_metric_name := v_clean_metadata->>'metricName';
    if v_metric_name is null or not (v_metric_name = any(v_performance_metrics)) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_metric');
    end if;
    if jsonb_typeof(v_clean_metadata->'durationMs') <> 'number' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_duration');
    end if;
    v_duration_ms := (v_clean_metadata->>'durationMs')::numeric;
    if v_duration_ms < 0 or v_duration_ms > 300000 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_duration');
    end if;
    if v_clean_metadata ? 'cacheHit' and jsonb_typeof(v_clean_metadata->'cacheHit') <> 'boolean' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_metric_metadata');
    end if;
    if v_clean_metadata ? 'startType' and coalesce(v_clean_metadata->>'startType','') not in ('cold_start','warm_start','unknown') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_metric_metadata');
    end if;
    if v_clean_metadata ? 'networkState' and coalesce(v_clean_metadata->>'networkState','') not in ('online','offline','unknown') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_metric_metadata');
    end if;
    if v_clean_metadata ? 'source' and coalesce(v_clean_metadata->>'source','') not in ('cached','live') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_metric_metadata');
    end if;

    select count(*) into v_recent_performance_count
    from public.analytics_events
    where user_id = v_user_id
      and event_name = 'performance_metric'
      and created_at >= now() - interval '1 minute';
    if v_recent_performance_count >= 30 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
  end if;

  insert into public.analytics_events (
    user_id, session_id, event_name, source, route, entity_type, entity_id, metadata, app_version, platform
  ) values (
    v_user_id, p_session_id, p_event_name, 'mobile', p_route, p_entity_type, p_entity_id,
    v_clean_metadata, p_app_version, lower(p_platform)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.track_analytics_event(text,text,text,text,uuid,jsonb,text,text) from public;
revoke all on function public.track_analytics_event(text,text,text,text,uuid,jsonb,text,text) from anon;
grant execute on function public.track_analytics_event(text,text,text,text,uuid,jsonb,text,text) to authenticated;
