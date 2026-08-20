-- PR #1: security lockdown for privileged database boundaries.
--
-- Goals:
-- 1) make the marketplace view respect caller RLS;
-- 2) remove client execution from internal trust/dispatch helpers;
-- 3) bind client-created notifications to real domain state instead of trusting
--    caller-supplied recipients/types;
-- 4) remove anonymous execution from admin-only RPCs while preserving the
--    authenticated admin surface (the functions still perform server-side
--    is_admin_user() checks).

alter view public.marketplace_items set (security_invoker = true);

-- Internal-only helpers. These functions run as SECURITY DEFINER and must not
-- be callable directly from mobile/anonymous clients.
revoke all on function public.increment_successful_swaps_for_users(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.increment_successful_swaps_for_users(uuid, uuid)
  to service_role;

revoke all on function public.reserve_smart_notification_dispatch(uuid, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_smart_notification_dispatch(uuid, text, text, text, text, uuid, jsonb)
  to service_role;

-- Admin RPCs are intentionally callable by signed-in clients because the app
-- contains an admin console. Keep the server-side admin check, but do not expose
-- these SECURITY DEFINER functions to anonymous callers.
revoke all on function public.review_report(uuid, text, text, text)
  from public, anon;
grant execute on function public.review_report(uuid, text, text, text)
  to authenticated, service_role;

revoke all on function public.hide_item_for_moderation(uuid, uuid)
  from public, anon;
grant execute on function public.hide_item_for_moderation(uuid, uuid)
  to authenticated, service_role;

-- Notification creation is a client-facing RPC, but the recipient and event
-- must be derived/validated against authoritative domain rows. Never trust a
-- caller to choose an arbitrary recipient and an arbitrary notification type.
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
  v_actor uuid := auth.uid();
  v_recipient uuid;
  v_offer public.offers%rowtype;
  v_deal public.swap_deals%rowtype;
  v_message_sender_id uuid;
  v_message_type text;
  v_message_body text;
  v_preview text;
  v_confirmation_count integer;
begin
  if v_actor is null then
    return;
  end if;

  -- Deal-message notifications are bound to a message that was actually sent
  -- by the caller in a deal they participate in.
  if notification_type in ('deal_message_received', 'deal_voice_message_received') then
    if target_deal_id is null or target_message_id is null then
      return;
    end if;

    select d.* into v_deal
    from public.swap_deals d
    where d.id = target_deal_id
      and v_actor in (d.requester_id, d.offerer_id)
    limit 1;

    if not found then
      return;
    end if;

    v_recipient := case
      when v_actor = v_deal.requester_id then v_deal.offerer_id
      else v_deal.requester_id
    end;

    if target_user_id is distinct from v_recipient then
      return;
    end if;

    select dm.sender_id, dm.message_type, dm.body
      into v_message_sender_id, v_message_type, v_message_body
    from public.deal_messages dm
    where dm.id = target_message_id
      and dm.deal_id = target_deal_id
      and dm.sender_id = v_actor
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
      v_recipient,
      v_actor,
      (case when v_message_type = 'voice'
        then 'deal_voice_message_received'
        else 'deal_message_received'
      end)::public.notification_type,
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

  -- Offer notifications are only valid when the caller is the expected actor
  -- and the offer is already in the state represented by the notification.
  if notification_type in (
    'offer_received',
    'offer_thinking',
    'offer_soft_rejected',
    'offer_accepted',
    'deal_created'
  ) then
    if target_offer_id is null then
      return;
    end if;

    select o.* into v_offer
    from public.offers o
    where o.id = target_offer_id
    limit 1;

    if not found then
      return;
    end if;

    if notification_type = 'offer_received' then
      if v_actor <> v_offer.sender_id
         or target_user_id <> v_offer.receiver_id
         or v_offer.status::text not in ('pending', 'thinking') then
        return;
      end if;
    elsif notification_type = 'offer_thinking' then
      if v_actor <> v_offer.receiver_id
         or target_user_id <> v_offer.sender_id
         or v_offer.status::text <> 'thinking' then
        return;
      end if;
    elsif notification_type = 'offer_soft_rejected' then
      if v_actor <> v_offer.receiver_id
         or target_user_id <> v_offer.sender_id
         or v_offer.status::text <> 'soft_rejected' then
        return;
      end if;
    elsif notification_type = 'offer_accepted' then
      if v_actor <> v_offer.receiver_id
         or target_user_id <> v_offer.sender_id
         or v_offer.status::text <> 'accepted' then
        return;
      end if;
    elsif notification_type = 'deal_created' then
      -- Only the offer receiver can accept and create the deal; notifying the
      -- sender is the only client-created deal_created notification needed.
      if v_actor <> v_offer.receiver_id
         or target_user_id <> v_offer.sender_id
         or v_offer.status::text <> 'accepted'
         or target_deal_id is null
         or not exists (
           select 1
           from public.swap_deals d
           where d.id = target_deal_id
             and d.offer_id = v_offer.id
             and d.requester_id = v_offer.receiver_id
             and d.offerer_id = v_offer.sender_id
         ) then
        return;
      end if;
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
      v_actor,
      notification_type::public.notification_type,
      notification_title,
      notification_body,
      target_item_id,
      target_offer_id,
      target_deal_id,
      null
    );

    return;
  end if;

  -- Completion notifications are bound to the authoritative deal state and
  -- can only target the other participant.
  if notification_type in ('deal_completed', 'deal_completion_confirmation_needed') then
    if target_deal_id is null then
      return;
    end if;

    select d.* into v_deal
    from public.swap_deals d
    where d.id = target_deal_id
      and v_actor in (d.requester_id, d.offerer_id)
    limit 1;

    if not found then
      return;
    end if;

    v_recipient := case
      when v_actor = v_deal.requester_id then v_deal.offerer_id
      else v_deal.requester_id
    end;

    if target_user_id is distinct from v_recipient then
      return;
    end if;

    if notification_type = 'deal_completion_confirmation_needed' then
      if v_deal.status::text <> 'completed_pending_confirmation'
         or not exists (
           select 1 from public.deal_confirmations c
           where c.deal_id = v_deal.id and c.user_id = v_actor
         )
         or exists (
           select 1 from public.deal_confirmations c
           where c.deal_id = v_deal.id and c.user_id = v_recipient
         ) then
        return;
      end if;
    else
      if v_deal.status::text <> 'completed' then
        return;
      end if;

      select count(distinct c.user_id)::integer
        into v_confirmation_count
      from public.deal_confirmations c
      where c.deal_id = v_deal.id
        and c.user_id in (v_deal.requester_id, v_deal.offerer_id);

      if coalesce(v_confirmation_count, 0) < 2 then
        return;
      end if;
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
      v_recipient,
      v_actor,
      notification_type::public.notification_type,
      notification_title,
      notification_body,
      null,
      null,
      target_deal_id,
      null
    );

    return;
  end if;

  -- Other notification types (including system/user_followed_you/contextual
  -- messages) are created by their dedicated server-side paths, not this
  -- generic client RPC.
  return;
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

-- Revoke both PUBLIC inheritance and Supabase's direct anon grant. Preserve the
-- authenticated client contract and service-side access.
revoke all on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid, uuid)
  to authenticated, service_role;

revoke all on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.create_notification(uuid, text, text, text, uuid, uuid, uuid)
  to authenticated, service_role;

-- The legacy enum overload already performs actor/target checks; remove its
-- anonymous exposure as well.
revoke all on function public.create_notification(uuid, public.notification_type, text, text, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.create_notification(uuid, public.notification_type, text, text, uuid, uuid, uuid)
  to authenticated, service_role;
