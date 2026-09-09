\set ON_ERROR_STOP on

-- Teswa Lane 4 notifications / analytics runtime port for OCI rehearsal.
-- Canonical source semantics captured 2026-09-06.
-- Identity authority only changes from auth.uid() to teswa_runtime.current_user_id().
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswa_app_authenticated') THEN
    CREATE ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END$$;
ALTER ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public,teswa_runtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.current_user_id(),teswa_runtime.require_user_id() TO teswa_app_authenticated;

CREATE OR REPLACE FUNCTION public.create_contextual_message_notification(p_conversation_id uuid,p_message_id uuid,p_kind text DEFAULT 'thread_message'::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_sender_id uuid; v_starter_id uuid; v_recipient_id uuid; v_target_user_id uuid;
  v_message_kind text; v_message_body text; v_preview text;
begin
  v_sender_id:=teswa_runtime.current_user_id();
  if v_sender_id is null then return; end if;
  select cm.message_kind,cm.body into v_message_kind,v_message_body
    from public.contextual_messages cm
   where cm.id=p_message_id and cm.conversation_id=p_conversation_id and cm.sender_id=v_sender_id limit 1;
  if v_message_kind is null then return; end if;
  select cc.starter_id,cc.recipient_id into v_starter_id,v_recipient_id
    from public.contextual_conversations cc
   where cc.id=p_conversation_id and (cc.starter_id=v_sender_id or cc.recipient_id=v_sender_id) limit 1;
  if v_starter_id is null and v_recipient_id is null then return; end if;
  v_target_user_id:=case when v_sender_id=v_starter_id then v_recipient_id else v_starter_id end;
  if v_target_user_id is null or v_target_user_id=v_sender_id then return; end if;
  v_preview:=nullif(left(trim(coalesce(v_message_body,'')),120),'');
  insert into public.notifications(user_id,actor_user_id,type,title,body,contextual_conversation_id,item_id,offer_id,deal_id)
  values(v_target_user_id,v_sender_id,'contextual_message_received'::public.notification_type,'رسالة جديدة على تِسوى',
    case when v_message_kind='voice' then 'وصلك تسجيل صوتي جديد.' when v_preview is not null then v_preview else 'وصلك رسالة جديدة.' end,
    p_conversation_id,null,null,null);
end;$function$;

CREATE OR REPLACE FUNCTION public.create_notification(target_user_id uuid,notification_type notification_type,notification_title text,notification_body text DEFAULT NULL::text,target_item_id uuid DEFAULT NULL::uuid,target_offer_id uuid DEFAULT NULL::uuid,target_deal_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_actor uuid:=teswa_runtime.current_user_id(); v_offer public.offers%rowtype; v_deal public.swap_deals%rowtype; new_id uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if target_user_id is null then raise exception 'target_user_id is required'; end if;
  if notification_type not in ('offer_received','offer_thinking','offer_accepted','offer_soft_rejected','offer_redirected','deal_created','deal_completed','deal_cancelled','report_update','system') then raise exception 'Unsupported notification type'; end if;
  if notification_type in ('offer_received','offer_thinking','offer_accepted','offer_soft_rejected','offer_redirected','deal_created') then
    if target_offer_id is null then raise exception 'offer notifications require target_offer_id'; end if;
    select * into v_offer from public.offers where id=target_offer_id;
    if not found then raise exception 'Offer not found'; end if;
    if notification_type='offer_received' then
      if v_actor<>v_offer.sender_id then raise exception 'Only sender can notify offer_received'; end if;
      if target_user_id<>v_offer.receiver_id then raise exception 'offer_received target mismatch'; end if;
    elsif notification_type in ('offer_thinking','offer_accepted','offer_soft_rejected','offer_redirected') then
      if v_actor<>v_offer.receiver_id then raise exception 'Only receiver can notify offer response'; end if;
      if target_user_id<>v_offer.sender_id then raise exception 'Offer response target mismatch'; end if;
    elsif notification_type='deal_created' then
      if v_actor<>v_offer.receiver_id then raise exception 'Only receiver can notify deal_created'; end if;
      if target_user_id not in (v_offer.sender_id,v_offer.receiver_id) then raise exception 'deal_created target must be participant'; end if;
      if target_deal_id is null then raise exception 'deal_created requires target_deal_id'; end if;
    end if;
  elsif notification_type in ('deal_completed','deal_cancelled','system') then
    if target_deal_id is null then raise exception 'deal/system notifications require target_deal_id'; end if;
    select * into v_deal from public.swap_deals where id=target_deal_id;
    if not found then raise exception 'Deal not found'; end if;
    if v_actor not in (v_deal.requester_id,v_deal.offerer_id) then raise exception 'Only deal participants can notify for this deal'; end if;
    if target_user_id not in (v_deal.requester_id,v_deal.offerer_id) then raise exception 'Deal notification target must be participant'; end if;
  elsif notification_type='report_update' then
    if not exists(select 1 from public.admin_users a where a.user_id=v_actor) then raise exception 'Only admins can send report_update notifications'; end if;
  end if;
  insert into public.notifications(user_id,type,title,body,item_id,offer_id,deal_id)
  values(target_user_id,notification_type,notification_title,notification_body,target_item_id,target_offer_id,target_deal_id)
  returning id into new_id;
  return new_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.create_notification(target_user_id uuid,notification_type text,notification_title text,notification_body text,target_item_id uuid DEFAULT NULL::uuid,target_offer_id uuid DEFAULT NULL::uuid,target_deal_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  perform public.create_notification(target_user_id,notification_type,notification_title,notification_body,target_item_id,target_offer_id,target_deal_id,null);
end;$function$;

CREATE OR REPLACE FUNCTION public.create_notification(target_user_id uuid,notification_type text,notification_title text,notification_body text,target_item_id uuid DEFAULT NULL::uuid,target_offer_id uuid DEFAULT NULL::uuid,target_deal_id uuid DEFAULT NULL::uuid,target_message_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_actor uuid:=teswa_runtime.current_user_id(); v_recipient uuid; v_offer public.offers%rowtype; v_deal public.swap_deals%rowtype;
  v_message_sender_id uuid; v_message_type text; v_message_body text; v_preview text; v_confirmation_count integer;
begin
  if v_actor is null then return; end if;
  if notification_type in ('deal_message_received','deal_voice_message_received') then
    if target_deal_id is null or target_message_id is null then return; end if;
    select d.* into v_deal from public.swap_deals d where d.id=target_deal_id and v_actor in (d.requester_id,d.offerer_id) limit 1;
    if not found then return; end if;
    v_recipient:=case when v_actor=v_deal.requester_id then v_deal.offerer_id else v_deal.requester_id end;
    if target_user_id is distinct from v_recipient then return; end if;
    select dm.sender_id,dm.message_type,dm.body into v_message_sender_id,v_message_type,v_message_body
      from public.deal_messages dm where dm.id=target_message_id and dm.deal_id=target_deal_id and dm.sender_id=v_actor limit 1;
    if v_message_sender_id is null then return; end if;
    v_preview:=nullif(left(trim(coalesce(v_message_body,'')),120),'');
    insert into public.notifications(user_id,actor_user_id,type,title,body,item_id,offer_id,deal_id,contextual_conversation_id)
    values(v_recipient,v_actor,(case when v_message_type='voice' then 'deal_voice_message_received' else 'deal_message_received' end)::public.notification_type,
      'رسالة جديدة على تِسوى',case when v_message_type='voice' then 'وصلك تسجيل صوتي جديد.' when v_preview is not null then v_preview else 'وصلك رسالة جديدة.' end,
      null,null,target_deal_id,null);
    return;
  end if;
  if notification_type in ('offer_received','offer_thinking','offer_soft_rejected','offer_accepted','deal_created') then
    if target_offer_id is null then return; end if;
    select o.* into v_offer from public.offers o where o.id=target_offer_id limit 1;
    if not found then return; end if;
    if notification_type='offer_received' then
      if v_actor<>v_offer.sender_id or target_user_id<>v_offer.receiver_id or v_offer.status::text not in ('pending','thinking') then return; end if;
    elsif notification_type='offer_thinking' then
      if v_actor<>v_offer.receiver_id or target_user_id<>v_offer.sender_id or v_offer.status::text<>'thinking' then return; end if;
    elsif notification_type='offer_soft_rejected' then
      if v_actor<>v_offer.receiver_id or target_user_id<>v_offer.sender_id or v_offer.status::text<>'soft_rejected' then return; end if;
    elsif notification_type='offer_accepted' then
      if v_actor<>v_offer.receiver_id or target_user_id<>v_offer.sender_id or v_offer.status::text<>'accepted' then return; end if;
    elsif notification_type='deal_created' then
      if v_actor<>v_offer.receiver_id or target_user_id<>v_offer.sender_id or v_offer.status::text<>'accepted' or target_deal_id is null or not exists(
        select 1 from public.swap_deals d where d.id=target_deal_id and d.offer_id=v_offer.id and d.requester_id=v_offer.receiver_id and d.offerer_id=v_offer.sender_id) then return; end if;
    end if;
    insert into public.notifications(user_id,actor_user_id,type,title,body,item_id,offer_id,deal_id,contextual_conversation_id)
    values(target_user_id,v_actor,notification_type::public.notification_type,notification_title,notification_body,target_item_id,target_offer_id,target_deal_id,null);
    return;
  end if;
  if notification_type in ('deal_completed','deal_completion_confirmation_needed') then
    if target_deal_id is null then return; end if;
    select d.* into v_deal from public.swap_deals d where d.id=target_deal_id and v_actor in (d.requester_id,d.offerer_id) limit 1;
    if not found then return; end if;
    v_recipient:=case when v_actor=v_deal.requester_id then v_deal.offerer_id else v_deal.requester_id end;
    if target_user_id is distinct from v_recipient then return; end if;
    if notification_type='deal_completion_confirmation_needed' then
      if v_deal.status::text<>'completed_pending_confirmation' or not exists(select 1 from public.deal_confirmations c where c.deal_id=v_deal.id and c.user_id=v_actor) or exists(select 1 from public.deal_confirmations c where c.deal_id=v_deal.id and c.user_id=v_recipient) then return; end if;
    else
      if v_deal.status::text<>'completed' then return; end if;
      select count(distinct c.user_id)::integer into v_confirmation_count from public.deal_confirmations c where c.deal_id=v_deal.id and c.user_id in (v_deal.requester_id,v_deal.offerer_id);
      if coalesce(v_confirmation_count,0)<2 then return; end if;
    end if;
    insert into public.notifications(user_id,actor_user_id,type,title,body,item_id,offer_id,deal_id,contextual_conversation_id)
    values(v_recipient,v_actor,notification_type::public.notification_type,notification_title,notification_body,null,null,target_deal_id,null);
    return;
  end if;
  return;
end;$function$;

CREATE OR REPLACE FUNCTION public.disable_my_push_device(p_expo_push_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id(); v_token text:=btrim(coalesce(p_expo_push_token,'')); v_updated integer;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_token='' then return false; end if;
  update public.push_devices set notifications_enabled=false,disabled_at=now(),updated_at=now() where user_id=v_user_id and expo_push_token=v_token;
  get diagnostics v_updated=row_count; return v_updated>0;
end;$function$;

CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS TABLE(offers_enabled boolean,deals_enabled boolean,messages_enabled boolean,social_enabled boolean,smart_reminders_enabled boolean,marketing_enabled boolean,quiet_hours_enabled boolean,quiet_hours_start text,quiet_hours_end text,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid;
begin
  v_uid:=teswa_runtime.current_user_id(); if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.notification_preferences(user_id) values(v_uid) on conflict(user_id) do nothing;
  return query select p.offers_enabled,p.deals_enabled,p.messages_enabled,p.social_enabled,p.smart_reminders_enabled,p.marketing_enabled,p.quiet_hours_enabled,p.quiet_hours_start,p.quiet_hours_end,p.updated_at from public.notification_preferences p where p.user_id=v_uid;
end;$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_notification_preferences()
RETURNS notification_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_pref public.notification_preferences;
begin
  v_uid:=teswa_runtime.current_user_id(); if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.notification_preferences(user_id) values(v_uid) on conflict(user_id) do nothing;
  select * into v_pref from public.notification_preferences where user_id=v_uid; return v_pref;
end;$function$;

CREATE OR REPLACE FUNCTION public.register_push_device(p_expo_push_token text,p_platform text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id(); v_token text:=btrim(coalesce(p_expo_push_token,'')); v_platform text:=lower(btrim(coalesce(p_platform,''))); v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if v_token='' then raise exception 'expo push token is required'; end if;
  if v_platform not in ('android','ios') then raise exception 'platform must be android or ios'; end if;
  insert into public.push_devices(user_id,expo_push_token,platform,notifications_enabled,disabled_at,last_registered_at,updated_at)
  values(v_user_id,v_token,v_platform,true,null,now(),now())
  on conflict(expo_push_token) do update set user_id=excluded.user_id,platform=excluded.platform,notifications_enabled=true,disabled_at=null,last_registered_at=now(),updated_at=now()
  returning id into v_id; return v_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.set_my_notification_timezone(p_timezone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $function$
declare v_uid uuid:=teswa_runtime.current_user_id(); v_timezone text:=nullif(btrim(coalesce(p_timezone,'')),'');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if v_timezone is null or length(v_timezone)>100 then raise exception 'invalid_timezone' using errcode='P0001'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then raise exception 'invalid_timezone' using errcode='P0001'; end if;
  insert into public.notification_preferences(user_id,timezone) values(v_uid,v_timezone)
  on conflict(user_id) do update set timezone=excluded.timezone,updated_at=now();
end;$function$;

CREATE OR REPLACE FUNCTION public.track_analytics_event(p_event_name text,p_session_id text,p_route text DEFAULT NULL::text,p_entity_type text DEFAULT NULL::text,p_entity_id uuid DEFAULT NULL::uuid,p_metadata jsonb DEFAULT '{}'::jsonb,p_app_version text DEFAULT NULL::text,p_platform text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid:=teswa_runtime.current_user_id(); v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb); v_clean_metadata jsonb:='{}'::jsonb;
  v_allowed_events text[]:=array['app_opened','session_started','auth_gate_viewed','home_viewed','search_viewed','item_detail_viewed','item_create_started','item_published','offer_started','offer_sent','offer_action_taken','deal_room_viewed','deal_message_sent','notification_opened','story_viewed','story_reply_started','profile_viewed','performance_metric'];
  v_performance_metrics text[]:=array['app_start_to_first_screen','auth_ready_time','home_first_content_time','direct_chat_first_message_time','dolab_first_content_time','item_detail_first_content_time'];
  v_performance_keys text[]:=array['metricName','durationMs','route','appVersion','platform','cacheHit','startType','networkState','source'];
  v_key text; v_value jsonb; v_key_count integer:=0; v_recent_count integer:=0; v_recent_performance_count integer:=0; v_metric_name text; v_duration_ms numeric;
begin
  if v_user_id is null then return jsonb_build_object('ok',false,'reason','unauthenticated'); end if;
  if p_event_name is null or not(p_event_name=any(v_allowed_events)) then return jsonb_build_object('ok',false,'reason','invalid_event'); end if;
  if p_session_id is null or char_length(btrim(p_session_id))<1 or char_length(p_session_id)>128 then return jsonb_build_object('ok',false,'reason','invalid_session'); end if;
  if p_route is not null and char_length(p_route)>160 then return jsonb_build_object('ok',false,'reason','invalid_route'); end if;
  if p_entity_type is not null and char_length(p_entity_type)>64 then return jsonb_build_object('ok',false,'reason','invalid_entity_type'); end if;
  if p_app_version is not null and char_length(p_app_version)>64 then return jsonb_build_object('ok',false,'reason','invalid_app_version'); end if;
  if p_platform is not null and (char_length(p_platform)>24 or lower(p_platform) not in ('android','ios','web')) then return jsonb_build_object('ok',false,'reason','invalid_platform'); end if;
  if jsonb_typeof(v_metadata)<>'object' or octet_length(v_metadata::text)>8192 then return jsonb_build_object('ok',false,'reason','invalid_metadata'); end if;
  select count(*) into v_key_count from jsonb_object_keys(v_metadata); if v_key_count>24 then return jsonb_build_object('ok',false,'reason','invalid_metadata'); end if;
  for v_key,v_value in select key,value from jsonb_each(v_metadata) loop
    if lower(v_key) ~ '(token|secret|password|email|phone|body|message|note|description|caption|comment|content|latitude|longitude|coordinates|gps|url|image)' then continue; end if;
    if jsonb_typeof(v_value)='object' then continue; end if;
    if jsonb_typeof(v_value)='array' then
      if jsonb_array_length(v_value)>20 or exists(select 1 from jsonb_array_elements(v_value) element where jsonb_typeof(element) not in ('string','number','boolean','null')) then continue; end if;
    end if;
    if jsonb_typeof(v_value)='string' and char_length(v_value #>> '{}')>256 then continue; end if;
    v_clean_metadata:=v_clean_metadata||jsonb_build_object(v_key,v_value);
  end loop;
  select count(*) into v_recent_count from public.analytics_events where user_id=v_user_id and created_at>=now()-interval '1 minute';
  if v_recent_count>=120 then return jsonb_build_object('ok',false,'reason','rate_limited'); end if;
  if p_event_name='performance_metric' then
    v_clean_metadata:=(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(v_clean_metadata) where key=any(v_performance_keys));
    v_metric_name:=v_clean_metadata->>'metricName'; if v_metric_name is null or not(v_metric_name=any(v_performance_metrics)) then return jsonb_build_object('ok',false,'reason','invalid_metric'); end if;
    if jsonb_typeof(v_clean_metadata->'durationMs')<>'number' then return jsonb_build_object('ok',false,'reason','invalid_duration'); end if;
    v_duration_ms:=(v_clean_metadata->>'durationMs')::numeric; if v_duration_ms<0 or v_duration_ms>300000 then return jsonb_build_object('ok',false,'reason','invalid_duration'); end if;
    if v_clean_metadata?'cacheHit' and jsonb_typeof(v_clean_metadata->'cacheHit')<>'boolean' then return jsonb_build_object('ok',false,'reason','invalid_metric_metadata'); end if;
    if v_clean_metadata?'startType' and coalesce(v_clean_metadata->>'startType','') not in ('cold_start','warm_start','unknown') then return jsonb_build_object('ok',false,'reason','invalid_metric_metadata'); end if;
    if v_clean_metadata?'networkState' and coalesce(v_clean_metadata->>'networkState','') not in ('online','offline','unknown') then return jsonb_build_object('ok',false,'reason','invalid_metric_metadata'); end if;
    if v_clean_metadata?'source' and coalesce(v_clean_metadata->>'source','') not in ('cached','live') then return jsonb_build_object('ok',false,'reason','invalid_metric_metadata'); end if;
    select count(*) into v_recent_performance_count from public.analytics_events where user_id=v_user_id and event_name='performance_metric' and created_at>=now()-interval '1 minute';
    if v_recent_performance_count>=30 then return jsonb_build_object('ok',false,'reason','rate_limited'); end if;
  end if;
  insert into public.analytics_events(user_id,session_id,event_name,source,route,entity_type,entity_id,metadata,app_version,platform)
  values(v_user_id,p_session_id,p_event_name,'mobile',p_route,p_entity_type,p_entity_id,v_clean_metadata,p_app_version,lower(p_platform));
  return jsonb_build_object('ok',true);
end;$function$;

CREATE OR REPLACE FUNCTION public.update_my_notification_preferences(p_offers_enabled boolean DEFAULT NULL::boolean,p_deals_enabled boolean DEFAULT NULL::boolean,p_messages_enabled boolean DEFAULT NULL::boolean,p_social_enabled boolean DEFAULT NULL::boolean,p_smart_reminders_enabled boolean DEFAULT NULL::boolean,p_marketing_enabled boolean DEFAULT NULL::boolean,p_quiet_hours_enabled boolean DEFAULT NULL::boolean,p_quiet_hours_start text DEFAULT NULL::text,p_quiet_hours_end text DEFAULT NULL::text)
RETURNS TABLE(offers_enabled boolean,deals_enabled boolean,messages_enabled boolean,social_enabled boolean,smart_reminders_enabled boolean,marketing_enabled boolean,quiet_hours_enabled boolean,quiet_hours_start text,quiet_hours_end text,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid;
begin
  v_uid:=teswa_runtime.current_user_id(); if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_quiet_hours_start is not null and p_quiet_hours_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_quiet_hours_start'; end if;
  if p_quiet_hours_end is not null and p_quiet_hours_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_quiet_hours_end'; end if;
  insert into public.notification_preferences as p(user_id,offers_enabled,deals_enabled,messages_enabled,social_enabled,smart_reminders_enabled,marketing_enabled,quiet_hours_enabled,quiet_hours_start,quiet_hours_end)
  values(v_uid,coalesce(p_offers_enabled,true),coalesce(p_deals_enabled,true),coalesce(p_messages_enabled,true),coalesce(p_social_enabled,true),coalesce(p_smart_reminders_enabled,true),coalesce(p_marketing_enabled,false),coalesce(p_quiet_hours_enabled,false),coalesce(p_quiet_hours_start,'23:00'),coalesce(p_quiet_hours_end,'08:00'))
  on conflict(user_id) do update set offers_enabled=coalesce(p_offers_enabled,p.offers_enabled),deals_enabled=coalesce(p_deals_enabled,p.deals_enabled),messages_enabled=coalesce(p_messages_enabled,p.messages_enabled),social_enabled=coalesce(p_social_enabled,p.social_enabled),smart_reminders_enabled=coalesce(p_smart_reminders_enabled,p.smart_reminders_enabled),marketing_enabled=coalesce(p_marketing_enabled,p.marketing_enabled),quiet_hours_enabled=coalesce(p_quiet_hours_enabled,p.quiet_hours_enabled),quiet_hours_start=coalesce(p_quiet_hours_start,p.quiet_hours_start),quiet_hours_end=coalesce(p_quiet_hours_end,p.quiet_hours_end);
  return query select p.offers_enabled,p.deals_enabled,p.messages_enabled,p.social_enabled,p.smart_reminders_enabled,p.marketing_enabled,p.quiet_hours_enabled,p.quiet_hours_start,p.quiet_hours_end,p.updated_at from public.notification_preferences p where p.user_id=v_uid;
end;$function$;

REVOKE ALL ON FUNCTION public.create_contextual_message_notification(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(uuid,notification_type,text,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disable_my_push_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_notification_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_notification_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_push_device(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_notification_timezone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_analytics_event(text,text,text,text,uuid,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_contextual_message_notification(uuid,uuid,text),public.create_notification(uuid,notification_type,text,text,uuid,uuid,uuid),public.create_notification(uuid,text,text,text,uuid,uuid,uuid),public.create_notification(uuid,text,text,text,uuid,uuid,uuid,uuid),public.disable_my_push_device(text),public.get_my_notification_preferences(),public.get_or_create_notification_preferences(),public.register_push_device(text,text),public.set_my_notification_timezone(text),public.track_analytics_event(text,text,text,text,uuid,jsonb,text,text),public.update_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text) TO teswa_app_authenticated;

GRANT SELECT,UPDATE ON public.notifications TO teswa_app_authenticated;
GRANT SELECT,INSERT,UPDATE ON public.notification_preferences TO teswa_app_authenticated;
GRANT SELECT ON public.push_devices,public.smart_notification_dispatches TO teswa_app_authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_notification_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_self_select ON public.notifications;
CREATE POLICY notifications_self_select ON public.notifications FOR SELECT TO teswa_app_authenticated USING(user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS notifications_self_update ON public.notifications;
CREATE POLICY notifications_self_update ON public.notifications FOR UPDATE TO teswa_app_authenticated USING(user_id=teswa_runtime.current_user_id()) WITH CHECK(user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS notification_preferences_insert_own ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_own ON public.notification_preferences FOR INSERT TO teswa_app_authenticated WITH CHECK(user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own ON public.notification_preferences FOR SELECT TO teswa_app_authenticated USING(user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;
CREATE POLICY notification_preferences_update_own ON public.notification_preferences FOR UPDATE TO teswa_app_authenticated USING(user_id=teswa_runtime.current_user_id()) WITH CHECK(user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS push_devices_select_own ON public.push_devices;
CREATE POLICY push_devices_select_own ON public.push_devices FOR SELECT TO teswa_app_authenticated USING(user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS smart_notification_dispatches_select_own ON public.smart_notification_dispatches;
CREATE POLICY smart_notification_dispatches_select_own ON public.smart_notification_dispatches FOR SELECT TO teswa_app_authenticated USING(user_id=teswa_runtime.current_user_id());

COMMIT;
