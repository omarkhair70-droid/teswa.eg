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
  v_starter_id uuid;
  v_recipient_id uuid;
  v_target_user_id uuid;
  v_message_kind text;
  v_message_body text;
  v_preview text;
begin
  v_sender_id := auth.uid();
  if v_sender_id is null then
    return;
  end if;

  select cm.message_kind, cm.body
    into v_message_kind, v_message_body
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

  v_target_user_id := case when v_sender_id = v_starter_id then v_recipient_id else v_starter_id end;

  if v_target_user_id is null or v_target_user_id = v_sender_id then
    return;
  end if;

  v_preview := nullif(left(trim(coalesce(v_message_body, '')), 120), '');

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    contextual_conversation_id,
    item_id,
    offer_id,
    deal_id
  ) values (
    v_target_user_id,
    v_sender_id,
    'contextual_message_received'::public.notification_type,
    'رسالة جديدة على تِسوى',
    case
      when v_message_kind = 'voice' then 'وصلك تسجيل صوتي جديد.'
      when v_preview is not null then v_preview
      else 'وصلك رسالة جديدة.'
    end,
    p_conversation_id,
    null,
    null,
    null
  );
end;
$$;

revoke all on function public.create_contextual_message_notification(uuid, uuid, text) from public;
grant execute on function public.create_contextual_message_notification(uuid, uuid, text) to authenticated;

create or replace function public.create_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  target_item_id uuid default null,
  target_offer_id uuid default null,
  target_deal_id uuid default null,
  target_message_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid;
  v_recipient_id uuid;
  v_message_sender_id uuid;
  v_message_type text;
  v_message_body text;
  v_requester_id uuid;
  v_offerer_id uuid;
  v_preview text;
  v_allowed_generic_types constant text[] := array[
    'offer_received',
    'offer_thinking',
    'offer_soft_rejected',
    'offer_accepted',
    'deal_created',
    'deal_completed',
    'deal_completion_confirmation_needed',
    'user_followed_you',
    'system'
  ];
begin
  v_sender_id := auth.uid();
  if v_sender_id is null then
    return;
  end if;

  if notification_type in ('deal_message_received', 'deal_voice_message_received') then
    if target_deal_id is null or target_message_id is null then
      return;
    end if;

    select d.requester_id, d.offerer_id
      into v_requester_id, v_offerer_id
    from public.swap_deals d
    where d.id = target_deal_id
      and (d.requester_id = v_sender_id or d.offerer_id = v_sender_id)
    limit 1;

    if v_requester_id is null and v_offerer_id is null then
      return;
    end if;

    v_recipient_id := case when v_sender_id = v_requester_id then v_offerer_id else v_requester_id end;
    if v_recipient_id is null or v_recipient_id = v_sender_id then
      return;
    end if;

    select dm.sender_id, dm.message_type, dm.body
      into v_message_sender_id, v_message_type, v_message_body
    from public.deal_messages dm
    where dm.id = target_message_id
      and dm.deal_id = target_deal_id
      and dm.sender_id = v_sender_id
    limit 1;

    if v_message_sender_id is null then
      return;
    end if;

    v_preview := nullif(left(trim(coalesce(v_message_body, '')), 120), '');

    insert into public.notifications (
      user_id,
      actor_user_id,
      type,
      title,
      body,
      item_id,
      offer_id,
      deal_id,
      contextual_conversation_id
    ) values (
      v_recipient_id,
      v_sender_id,
      (
        case
          when v_message_type = 'voice' then 'deal_voice_message_received'
          else 'deal_message_received'
        end
      )::public.notification_type,
      'رسالة جديدة على تِسوى',
      case
        when v_message_type = 'voice' then 'وصلك تسجيل صوتي جديد.'
        when v_preview is not null then v_preview
        else 'وصلك رسالة جديدة.'
      end,
      null,
      null,
      target_deal_id,
      null
    );

    return;
  end if;

  if notification_type in ('contextual_message_received', 'story_reply_received', 'deal_message_received', 'deal_voice_message_received') then
    return;
  end if;

  if not (notification_type = any(v_allowed_generic_types)) then
    return;
  end if;

  if target_user_id is null or target_user_id = v_sender_id then
    return;
  end if;

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    item_id,
    offer_id,
    deal_id,
    contextual_conversation_id
  ) values (
    target_user_id,
    v_sender_id,
    notification_type::public.notification_type,
    notification_title,
    notification_body,
    target_item_id,
    target_offer_id,
    target_deal_id,
    null
  );
end;
$$;

create or replace function public.create_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  target_item_id uuid default null,
  target_offer_id uuid default null,
  target_deal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_notification(
    target_user_id,
    notification_type,
    notification_title,
    notification_body,
    target_item_id,
    target_offer_id,
    target_deal_id,
    null
  );
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid, uuid) from public;
grant execute on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid) from public;
grant execute on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid) to authenticated;
