alter type public.report_reason add value if not exists 'harassment';
alter type public.report_reason add value if not exists 'fraud';

create or replace function public.report_user(
  p_reported_user_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_reported_user_id is null or p_reported_user_id = v_uid then raise exception 'invalid_target' using errcode='P0001'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_reported_user_id) then raise exception 'user_not_found' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin
    v_reason := trim(p_reason)::public.report_reason;
  exception when invalid_text_representation then
    raise exception 'invalid_reason' using errcode='P0001';
  end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reason, details, status)
  values (v_uid, p_reported_user_id, v_reason, nullif(trim(coalesce(p_details,'')),''), 'open'::public.report_status);
end;
$$;

create or replace function public.report_item(
  p_item_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select i.owner_id into v_owner from public.items i where i.id = p_item_id;
  if v_owner is null then raise exception 'item_not_found' using errcode='P0001'; end if;
  if v_owner = v_uid then raise exception 'cannot_report_own_item' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin
    v_reason := trim(p_reason)::public.report_reason;
  exception when invalid_text_representation then
    raise exception 'invalid_reason' using errcode='P0001';
  end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_item_id, reason, details, status)
  values (v_uid, v_owner, p_item_id, v_reason, nullif(trim(coalesce(p_details,'')),''), 'open'::public.report_status);
end;
$$;

create or replace function public.report_deal(
  p_deal_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.swap_deals%rowtype;
  v_reported_user_id uuid;
  v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_deal from public.swap_deals where id = p_deal_id;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_deal.requester_id, v_deal.offerer_id) then raise exception 'not_participant' using errcode='42501'; end if;
  v_reported_user_id := case when v_deal.requester_id = v_uid then v_deal.offerer_id else v_deal.requester_id end;
  if v_reported_user_id is null or v_reported_user_id = v_uid then raise exception 'invalid_target' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin
    v_reason := trim(p_reason)::public.report_reason;
  exception when invalid_text_representation then
    raise exception 'invalid_reason' using errcode='P0001';
  end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_deal_id, reason, details, status)
  values (v_uid, v_reported_user_id, p_deal_id, v_reason, nullif(trim(coalesce(p_details,'')),''), 'open'::public.report_status);
end;
$$;

create or replace function public.report_story(
  p_story_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author_id uuid;
  v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select s.user_id into v_author_id from public.stories s where s.id = p_story_id;
  if v_author_id is null then raise exception 'story_not_found' using errcode='P0001'; end if;
  if v_author_id = v_uid then raise exception 'cannot_report_own_story' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin
    v_reason := trim(p_reason)::public.report_reason;
  exception when invalid_text_representation then
    raise exception 'invalid_reason' using errcode='P0001';
  end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, story_id, reason, details, status)
  values (v_uid, v_author_id, p_story_id, v_reason, nullif(trim(coalesce(p_details,'')),''), 'open'::public.report_status);
end;
$$;

create or replace function public.report_deal_message(
  p_deal_id uuid,
  p_deal_message_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.swap_deals%rowtype;
  v_sender uuid;
  v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_deal from public.swap_deals where id = p_deal_id;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_deal.requester_id, v_deal.offerer_id) then raise exception 'not_participant' using errcode='42501'; end if;
  select dm.sender_id into v_sender from public.deal_messages dm where dm.id = p_deal_message_id and dm.deal_id = p_deal_id;
  if v_sender is null then raise exception 'deal_message_not_found' using errcode='P0001'; end if;
  if v_sender = v_uid then raise exception 'cannot_report_own_message' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin
    v_reason := trim(p_reason)::public.report_reason;
  exception when invalid_text_representation then
    raise exception 'invalid_reason' using errcode='P0001';
  end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_deal_id, reported_deal_message_id, reason, details, status)
  values (v_uid, v_sender, p_deal_id, p_deal_message_id, v_reason, nullif(trim(coalesce(p_details,'')),''), 'open'::public.report_status);
end;
$$;

create or replace function public.report_direct_message(
  p_conversation_id uuid,
  p_stream_message_id text,
  p_reported_user_id uuid,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_convo public.direct_conversations%rowtype;
  v_other uuid;
  v_message_id uuid;
  v_sender uuid;
  v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_convo from public.direct_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_convo.participant_a, v_convo.participant_b) then raise exception 'not_participant' using errcode='42501'; end if;
  v_other := case when v_convo.participant_a = v_uid then v_convo.participant_b else v_convo.participant_a end;
  if p_reported_user_id is distinct from v_other then raise exception 'invalid_reported_user' using errcode='P0001'; end if;
  begin
    v_message_id := trim(coalesce(p_stream_message_id,''))::uuid;
  exception when others then
    raise exception 'invalid_message' using errcode='P0001';
  end;
  select dm.sender_id into v_sender from public.direct_messages dm where dm.id = v_message_id and dm.conversation_id = p_conversation_id;
  if v_sender is null then raise exception 'message_not_found' using errcode='P0001'; end if;
  if v_sender = v_uid then raise exception 'cannot_report_own_message' using errcode='P0001'; end if;
  if v_sender is distinct from v_other then raise exception 'invalid_message_sender' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin
    v_reason := trim(p_reason)::public.report_reason;
  exception when invalid_text_representation then
    raise exception 'invalid_reason' using errcode='P0001';
  end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_direct_conversation_id, reported_stream_message_id, reason, details, status)
  values (v_uid, v_other, p_conversation_id, v_message_id::text, v_reason, nullif(trim(coalesce(p_details,'')),''), 'open'::public.report_status);
end;
$$;

revoke all on function public.report_user(uuid,text,text) from public;
grant execute on function public.report_user(uuid,text,text) to authenticated;
revoke all on function public.report_item(uuid,text,text) from public;
grant execute on function public.report_item(uuid,text,text) to authenticated;
revoke all on function public.report_deal(uuid,text,text) from public;
grant execute on function public.report_deal(uuid,text,text) to authenticated;
revoke all on function public.report_story(uuid,text,text) from public;
grant execute on function public.report_story(uuid,text,text) to authenticated;
revoke all on function public.report_deal_message(uuid,uuid,text,text) from public;
grant execute on function public.report_deal_message(uuid,uuid,text,text) to authenticated;
revoke all on function public.report_direct_message(uuid,text,uuid,text,text) from public;
grant execute on function public.report_direct_message(uuid,text,uuid,text,text) to authenticated;
