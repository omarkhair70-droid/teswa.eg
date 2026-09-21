alter table public.reports
  add column if not exists reported_contextual_conversation_id uuid null
    references public.contextual_conversations(id) on delete set null,
  add column if not exists reported_contextual_message_id uuid null
    references public.contextual_messages(id) on delete set null;

create index if not exists reports_reported_contextual_conversation_id_idx
  on public.reports (reported_contextual_conversation_id);

create index if not exists reports_reported_contextual_message_id_idx
  on public.reports (reported_contextual_message_id);

create or replace function public.report_contextual_message(
  p_conversation_id uuid,
  p_contextual_message_id uuid,
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
  v_conversation public.contextual_conversations%rowtype;
  v_sender uuid;
  v_reason public.report_reason;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select *
  into v_conversation
  from public.contextual_conversations
  where id = p_conversation_id;

  if not found then
    raise exception 'conversation_not_found' using errcode='P0001';
  end if;

  if v_uid not in (v_conversation.starter_id, v_conversation.recipient_id) then
    raise exception 'not_participant' using errcode='42501';
  end if;

  select m.sender_id
  into v_sender
  from public.contextual_messages m
  where m.id = p_contextual_message_id
    and m.conversation_id = p_conversation_id;

  if v_sender is null then
    raise exception 'contextual_message_not_found' using errcode='P0001';
  end if;

  if v_sender = v_uid then
    raise exception 'cannot_report_own_message' using errcode='P0001';
  end if;

  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then
    raise exception 'invalid_reason' using errcode='P0001';
  end if;

  begin
    v_reason := trim(p_reason)::public.report_reason;
  exception when invalid_text_representation then
    raise exception 'invalid_reason' using errcode='P0001';
  end;

  perform public.enforce_reports_rate_limit(v_uid);

  insert into public.reports (
    reporter_id,
    reported_user_id,
    reported_contextual_conversation_id,
    reported_contextual_message_id,
    reason,
    details,
    status
  )
  values (
    v_uid,
    v_sender,
    p_conversation_id,
    p_contextual_message_id,
    v_reason,
    nullif(trim(coalesce(p_details,'')),''),
    'open'::public.report_status
  );
end;
$$;

revoke all on function public.report_contextual_message(uuid,uuid,text,text) from public;
grant execute on function public.report_contextual_message(uuid,uuid,text,text) to authenticated;
