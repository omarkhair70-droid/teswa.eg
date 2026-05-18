create or replace function public.create_contextual_message_notification(
  p_conversation_id uuid,
  p_message_id uuid,
  p_kind text default 'thread_message'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
  v_kind text;
  v_starter_id uuid;
  v_recipient_id uuid;
  v_target_user_id uuid;
  v_title text;
  v_body text;
  v_message_kind text;
begin
  v_sender_id := auth.uid();
  if v_sender_id is null then
    return;
  end if;

  v_kind := case
    when p_kind in ('story_reply_initial', 'thread_message') then p_kind
    else 'thread_message'
  end;

  select cm.message_kind
    into v_message_kind
  from public.contextual_messages cm
  where cm.id = p_message_id
    and cm.conversation_id = p_conversation_id
    and cm.sender_id = v_sender_id
  limit 1;

  if v_message_kind is null then
    return;
  end if;

  select cc.starter_id, cc.recipient_id
    into v_starter_id, v_recipient_id
  from public.contextual_conversations cc
  where cc.id = p_conversation_id
    and (cc.starter_id = v_sender_id or cc.recipient_id = v_sender_id)
  limit 1;

  if v_starter_id is null and v_recipient_id is null then
    return;
  end if;

  if v_sender_id = v_starter_id then
    v_target_user_id := v_recipient_id;
  else
    v_target_user_id := v_starter_id;
  end if;

  if v_target_user_id is null or v_target_user_id = v_sender_id then
    return;
  end if;

  if v_kind = 'story_reply_initial' then
    if v_message_kind = 'voice' then
      v_title := 'رد صوتي جديد على قصتك';
      v_body := 'حد رد على قصتك بصوته وفتح باب كلام جديد.';
    else
      v_title := 'رد جديد على قصتك';
      v_body := 'حد رد على قصتك وفتح باب كلام جديد.';
    end if;
  else
    if v_message_kind = 'voice' then
      v_title := 'رسالة صوتية جديدة في ردود القصص';
      v_body := 'وصلك رد صوتي جديد داخل محادثة بدأت من قصة.';
    else
      v_title := 'رسالة جديدة في ردود القصص';
      v_body := 'وصلك رد جديد داخل محادثة بدأت من قصة.';
    end if;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    item_id,
    offer_id,
    deal_id,
    contextual_conversation_id
  )
  values (
    v_target_user_id,
    'system',
    v_title,
    v_body,
    null,
    null,
    null,
    p_conversation_id
  );
end;
$$;

revoke all on function public.create_contextual_message_notification(uuid, uuid, text) from public;
grant execute on function public.create_contextual_message_notification(uuid, uuid, text) to authenticated;
