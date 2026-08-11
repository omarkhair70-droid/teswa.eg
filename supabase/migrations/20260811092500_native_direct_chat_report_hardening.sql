-- Direct Chat message ids are now first-party direct_messages UUIDs. Keep the
-- historical report column/function argument name for schema compatibility, but
-- validate the message against Teswa's own database before accepting a report.

create or replace function public.report_direct_message(
  p_conversation_id uuid,
  p_stream_message_id text,
  p_reported_user_id uuid,
  p_reason text,
  p_details text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_convo public.direct_conversations%rowtype;
  v_other uuid;
  v_message_id uuid;
  v_sender uuid;
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

  select dm.sender_id into v_sender
  from public.direct_messages dm
  where dm.id = v_message_id and dm.conversation_id = p_conversation_id;

  if v_sender is null then raise exception 'message_not_found' using errcode='P0001'; end if;
  if v_sender = v_uid then raise exception 'cannot_report_own_message' using errcode='P0001'; end if;
  if v_sender is distinct from v_other then raise exception 'invalid_message_sender' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;

  perform public.enforce_reports_rate_limit(v_uid);

  insert into public.reports (
    reporter_id,
    reported_user_id,
    reported_direct_conversation_id,
    reported_stream_message_id,
    reason,
    details,
    status
  ) values (
    v_uid,
    v_other,
    p_conversation_id,
    v_message_id::text,
    trim(p_reason),
    nullif(trim(coalesce(p_details,'')),''),
    'open'
  );
end; $$;

revoke all on function public.report_direct_message(uuid,text,uuid,text,text) from public;
grant execute on function public.report_direct_message(uuid,text,uuid,text,text) to authenticated;
