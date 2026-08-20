-- Read-only regression contract for Teswa runtime observability.
do $$
declare
  fn_oid oid := 'public.track_analytics_event(text,text,text,text,uuid,jsonb,text,text)'::regprocedure;
  fn_def text;
  fn_config text[];
  metric_name text;
begin
  select pg_get_functiondef(fn_oid), p.proconfig
    into fn_def, fn_config
  from pg_proc p
  where p.oid = fn_oid;

  if fn_def is null then
    raise exception 'track_analytics_event is missing';
  end if;

  if not exists (
    select 1 from pg_proc p where p.oid=fn_oid and p.prosecdef
  ) then
    raise exception 'track_analytics_event must remain SECURITY DEFINER';
  end if;

  if fn_config is null or not (fn_config @> array['search_path=public']) then
    raise exception 'track_analytics_event must pin search_path=public';
  end if;

  if has_function_privilege('anon',fn_oid,'execute') then
    raise exception 'anon must not execute track_analytics_event';
  end if;
  if not has_function_privilege('authenticated',fn_oid,'execute') then
    raise exception 'authenticated lost track_analytics_event execute';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='analytics_events' and c.relrowsecurity
  ) then
    raise exception 'analytics_events must keep RLS enabled';
  end if;

  if has_table_privilege('anon','public.analytics_events','select')
     or has_table_privilege('anon','public.analytics_events','insert')
     or has_table_privilege('anon','public.analytics_events','update')
     or has_table_privilege('anon','public.analytics_events','delete') then
    raise exception 'anon must not have direct analytics_events privileges';
  end if;

  if has_table_privilege('authenticated','public.analytics_events','select')
     or has_table_privilege('authenticated','public.analytics_events','insert')
     or has_table_privilege('authenticated','public.analytics_events','update')
     or has_table_privilege('authenticated','public.analytics_events','delete') then
    raise exception 'authenticated must use the analytics RPC, not direct table access';
  end if;

  if position('performance_metric' in fn_def) = 0 then
    raise exception 'performance_metric must be accepted by the analytics RPC';
  end if;
  if position('octet_length(v_metadata::text) > 8192' in fn_def) = 0
     or position('v_recent_count >= 120' in fn_def) = 0
     or position('v_recent_performance_count >= 30' in fn_def) = 0 then
    raise exception 'analytics size/rate limits are missing';
  end if;
  if position('jsonb_typeof(v_value) = ''object''' in fn_def) = 0
     or position('token|secret|password|email|phone' in fn_def) = 0 then
    raise exception 'server-side analytics metadata privacy filtering is missing';
  end if;

  foreach metric_name in array array[
    'app_start_to_first_screen','auth_ready_time','home_first_content_time',
    'direct_chat_first_message_time','dolab_first_content_time','item_detail_first_content_time'
  ] loop
    if position(metric_name in fn_def) = 0 then
      raise exception 'performance metric % is missing from server allowlist', metric_name;
    end if;
  end loop;
end
$$;

select 'observability_contract_ok' as result;
