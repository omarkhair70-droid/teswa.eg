-- Direct-message requests are a message action, not a profile-view action.
-- Older mobile code created `requested` conversations while merely opening the
-- message entry point. Clean those empty rows and expose one transactional RPC
-- that creates/opens the conversation and sends the first text together.

delete from public.direct_conversations c
where c.status = 'requested'
  and c.last_message_at is null
  and not exists (
    select 1
    from public.direct_messages dm
    where dm.conversation_id = c.id
  );

create or replace function public.start_direct_conversation_with_message(
  p_target_user_id uuid,
  p_body text
)
returns table (
  ok boolean,
  message text,
  conversation_id uuid,
  message_id uuid,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_text text := btrim(coalesce(p_body, ''));
  v_start record;
  v_send record;
  v_requested_by uuid;
begin
  if v_user_id is null then
    return query select false, 'تسجيل الدخول مطلوب.', null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if p_target_user_id is null then
    return query select false, 'تعذر تحديد المستخدم.', null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if char_length(v_text) = 0 or char_length(v_text) > 1200 then
    return query select false, 'الرسالة يجب أن تكون بين 1 و1200 حرف.', null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select *
  into v_start
  from public.start_or_get_direct_conversation(p_target_user_id)
  limit 1;

  if v_start is null or not coalesce(v_start.ok, false) or v_start.conversation_id is null then
    return query select false,
      coalesce(v_start.message, 'تعذر فتح المراسلة حالياً.'),
      null::uuid,
      null::uuid,
      null::text,
      null::timestamptz;
    return;
  end if;

  select c.requested_by
  into v_requested_by
  from public.direct_conversations c
  where c.id = v_start.conversation_id;

  if v_start.status = 'requested' and v_requested_by is distinct from v_user_id then
    return query select false,
      'عندك طلب مراسلة من المستخدم ده.',
      v_start.conversation_id,
      null::uuid,
      v_start.status,
      null::timestamptz;
    return;
  end if;

  select *
  into v_send
  from public.send_direct_native_message(
    v_start.conversation_id,
    v_text,
    null,
    '[]'::jsonb,
    jsonb_build_object('request_entry', true)
  )
  limit 1;

  if v_send is null or not coalesce(v_send.ok, false) then
    -- If opening this request created an otherwise-empty row, remove it in the
    -- same transaction. This prevents phantom requests even when sending fails.
    delete from public.direct_conversations c
    where c.id = v_start.conversation_id
      and c.status = 'requested'
      and c.requested_by = v_user_id
      and c.last_message_at is null
      and not exists (
        select 1
        from public.direct_messages dm
        where dm.conversation_id = c.id
      );

    return query select false,
      coalesce(v_send.message, 'تعذر إرسال الرسالة حالياً.'),
      v_start.conversation_id,
      null::uuid,
      v_start.status,
      null::timestamptz;
    return;
  end if;

  return query select true,
    case when v_start.status = 'accepted' then 'تم إرسال الرسالة.' else 'تم إرسال طلب المراسلة.' end,
    v_start.conversation_id,
    v_send.message_id,
    v_start.status,
    v_send.created_at;
end;
$$;

revoke all on function public.start_direct_conversation_with_message(uuid, text) from public;
revoke all on function public.start_direct_conversation_with_message(uuid, text) from anon;
grant execute on function public.start_direct_conversation_with_message(uuid, text) to authenticated;
grant execute on function public.start_direct_conversation_with_message(uuid, text) to service_role;
