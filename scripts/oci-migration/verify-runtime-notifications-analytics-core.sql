\set ON_ERROR_STOP on

DO $$
declare v_fn integer; v_bad integer; v_pol integer; v_pol_bad integer; v_reason text;
begin
  select count(*) into v_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('create_contextual_message_notification','create_notification','disable_my_push_device','get_my_notification_preferences','get_or_create_notification_preferences','register_push_device','set_my_notification_timezone','track_analytics_event','update_my_notification_preferences');
  if v_fn<>11 then raise exception 'expected 11 notifications/analytics signatures, found %',v_fn; end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('create_contextual_message_notification','create_notification','disable_my_push_device','get_my_notification_preferences','get_or_create_notification_preferences','register_push_device','set_my_notification_timezone','track_analytics_event','update_my_notification_preferences')
     and pg_get_functiondef(p.oid) like '%auth.uid()%';
  if v_bad<>0 then raise exception 'auth.uid remains in % notification/analytics functions',v_bad; end if;
  select count(*) into v_pol from pg_policies where schemaname='public' and policyname in ('notifications_self_select','notifications_self_update','notification_preferences_insert_own','notification_preferences_select_own','notification_preferences_update_own','push_devices_select_own','smart_notification_dispatches_select_own');
  if v_pol<>7 then raise exception 'expected 7 notification policies, found %',v_pol; end if;
  select count(*) into v_pol_bad from pg_policies where schemaname='public' and tablename in ('notifications','notification_preferences','push_devices','smart_notification_dispatches') and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%');
  if v_pol_bad<>0 then raise exception 'auth.uid remains in % notification policies',v_pol_bad; end if;
  v_reason:=public.track_analytics_event('app_opened','probe')->>'reason';
  if v_reason<>'unauthenticated' then raise exception 'analytics unauth guard failed: %',coalesce(v_reason,'null'); end if;
end$$;

BEGIN;
DO $$
declare v_u uuid; v_token text; v_device uuid; v_disabled boolean; v_ok boolean; v_reason text; v_tz text;
begin
  select id into v_u from teswa_identity.users order by id limit 1;
  if v_u is null then raise exception 'no identity fixture'; end if;
  perform set_config('teswa.user_id',v_u::text,true);

  perform public.get_or_create_notification_preferences();
  if not exists(select 1 from public.notification_preferences where user_id=v_u) then raise exception 'preference create failed'; end if;
  perform public.set_my_notification_timezone('Africa/Cairo');
  select timezone into v_tz from public.notification_preferences where user_id=v_u;
  if v_tz<>'Africa/Cairo' then raise exception 'timezone update failed: %',coalesce(v_tz,'null'); end if;
  perform public.update_my_notification_preferences(p_marketing_enabled=>true,p_quiet_hours_enabled=>true,p_quiet_hours_start=>'22:00',p_quiet_hours_end=>'07:00');
  if not exists(select 1 from public.notification_preferences where user_id=v_u and marketing_enabled and quiet_hours_enabled and quiet_hours_start='22:00' and quiet_hours_end='07:00') then raise exception 'preference update failed'; end if;

  v_token:='ExponentPushToken[teswa-oci-rehearsal-'||replace(v_u::text,'-','')||']';
  select public.register_push_device(v_token,'android') into v_device;
  if v_device is null then raise exception 'push register failed'; end if;
  select public.disable_my_push_device(v_token) into v_disabled;
  if coalesce(v_disabled,false) is not true then raise exception 'push disable failed'; end if;

  v_reason:=public.track_analytics_event('not_real_event','probe')->>'reason';
  if v_reason<>'invalid_event' then raise exception 'analytics invalid-event guard failed: %',coalesce(v_reason,'null'); end if;
  v_ok:=coalesce((public.track_analytics_event('app_opened','oci-rehearsal',null,null,null,'{}'::jsonb,'rehearsal','android')->>'ok')::boolean,false);
  if not v_ok then raise exception 'analytics valid event failed'; end if;
  if not exists(select 1 from public.analytics_events where user_id=v_u and session_id='oci-rehearsal' and event_name='app_opened') then raise exception 'analytics row missing'; end if;
end$$;
ROLLBACK;

SELECT CASE WHEN teswa_runtime.current_user_id() IS NULL THEN 'notifications_transaction_identity_cleanup=PASS' ELSE 'notifications_transaction_identity_cleanup=FAIL' END;
SELECT 'runtime_notifications_analytics_core=PASS' AS result;
