create or replace function public.start_or_get_direct_conversation(p_target_user_id uuid)
returns table (ok boolean, conversation_id uuid, status text, requires_request boolean, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_row public.direct_conversations%rowtype;
  v_open_allowed boolean := false;
begin
  update public.direct_conversations c
  set status = 'accepted', accepted_at = coalesce(c.accepted_at, now()), updated_at = now()
  where c.status = 'requested'
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = c.participant_a and b.blocked_user_id = c.participant_b)
         or (b.blocker_id = c.participant_b and b.blocked_user_id = c.participant_a)
    )
    and exists (
      select 1
      from public.swap_deals d
      where d.status in ('coordinating', 'completed_pending_confirmation', 'completed')
        and ((d.requester_id = c.participant_a and d.offerer_id = c.participant_b)
          or (d.requester_id = c.participant_b and d.offerer_id = c.participant_a))
    );

  if v_user_id is null then return query select false, null::uuid, null::text, false, 'تسجيل الدخول مطلوب.'; return; end if;
  if p_target_user_id is null then return query select false, null::uuid, null::text, false, 'تعذر تحديد المستخدم.'; return; end if;
  if v_user_id = p_target_user_id then return query select false, null::uuid, null::text, false, 'لا يمكنك مراسلة نفسك.'; return; end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_user_id and b.blocked_user_id = p_target_user_id)
       or (b.blocker_id = p_target_user_id and b.blocked_user_id = v_user_id)
  ) then
    return query select false, null::uuid, null::text, false, 'لا يمكنك بدء المراسلة مع هذا المستخدم حالياً.'; return;
  end if;

  v_a := least(v_user_id, p_target_user_id);
  v_b := greatest(v_user_id, p_target_user_id);

  select * into v_row from public.direct_conversations where participant_a = v_a and participant_b = v_b limit 1;
  if found then
    if v_row.status = 'blocked' then return query select false, null::uuid, null::text, false, 'المحادثة غير متاحة حالياً.'; return; end if;
    if v_row.status = 'ignored' then
      update public.direct_conversations
      set status = 'requested', requested_by = v_user_id, updated_at = now()
      where id = v_row.id
      returning * into v_row;
    end if;
    if v_row.status = 'requested' then
      v_open_allowed :=
        exists (select 1 from public.user_follows f where f.follower_id = p_target_user_id and f.followed_id = v_user_id)
        or exists (
          select 1
          from public.user_follows f1
          join public.user_follows f2 on f2.follower_id = p_target_user_id and f2.followed_id = v_user_id
          where f1.follower_id = v_user_id and f1.followed_id = p_target_user_id
        )
        or exists (
          select 1
          from public.swap_deals d
          where d.status in ('coordinating', 'completed_pending_confirmation', 'completed')
            and ((d.requester_id = v_user_id and d.offerer_id = p_target_user_id)
              or (d.requester_id = p_target_user_id and d.offerer_id = v_user_id))
        );
      if v_open_allowed then
        update public.direct_conversations
        set status = 'accepted', accepted_at = coalesce(accepted_at, now()), updated_at = now()
        where id = v_row.id
        returning * into v_row;
      end if;
    end if;
    return query select true, v_row.id, v_row.status, v_row.status <> 'accepted', 'تم فتح المحادثة.'; return;
  end if;

  v_open_allowed :=
    exists (select 1 from public.user_follows f where f.follower_id = p_target_user_id and f.followed_id = v_user_id)
    or exists (
      select 1
      from public.user_follows f1
      join public.user_follows f2 on f2.follower_id = p_target_user_id and f2.followed_id = v_user_id
      where f1.follower_id = v_user_id and f1.followed_id = p_target_user_id
    )
    or exists (
      select 1
      from public.swap_deals d
      where d.status in ('coordinating', 'completed_pending_confirmation', 'completed')
        and ((d.requester_id = v_user_id and d.offerer_id = p_target_user_id)
          or (d.requester_id = p_target_user_id and d.offerer_id = v_user_id))
    );

  insert into public.direct_conversations (participant_a, participant_b, status, requested_by, accepted_at, created_at, updated_at)
  values (v_a, v_b, case when v_open_allowed then 'accepted' else 'requested' end, v_user_id, case when v_open_allowed then now() else null end, now(), now())
  returning * into v_row;

  return query select true, v_row.id, v_row.status, v_row.status <> 'accepted', case when v_row.status = 'accepted' then 'تم فتح المحادثة.' else 'تم إرسال طلب المراسلة.' end;
end;
$$;

create or replace function public.send_direct_message(p_conversation_id uuid, p_body text)
returns table (ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_convo public.direct_conversations%rowtype;
  v_text text := btrim(coalesce(p_body,''));
  v_mid uuid;
  v_created timestamptz;
begin
  if v_user_id is null then return query select false,'تسجيل الدخول مطلوب.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if p_conversation_id is null then return query select false,'تعذر تحديد المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if char_length(v_text)=0 or char_length(v_text)>1200 then return query select false,'الرسالة يجب أن تكون بين 1 و1200 حرف.',null::uuid,null::uuid,null::timestamptz; return; end if;

  select * into v_convo from public.direct_conversations where id = p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) then return query select false,'غير مسموح لك بهذه المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_convo.participant_a and b.blocked_user_id = v_convo.participant_b)
       or (b.blocker_id = v_convo.participant_b and b.blocked_user_id = v_convo.participant_a)
  ) then
    return query select false,'لا يمكن إرسال الرسائل حالياً.',null::uuid,null::uuid,null::timestamptz; return;
  end if;

  if v_convo.status in ('blocked', 'ignored') then return query select false,'المحادثة غير متاحة حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if v_convo.status = 'requested' and v_user_id = v_convo.requested_by then
    if exists (
      select 1 from public.direct_messages dm
      where dm.conversation_id = v_convo.id and dm.sender_id = v_user_id
    ) then
      return query select false,'طلب المراسلة اتبعت. هتكملوا الكلام لما الطلب يتقبل.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
  end if;

  if v_convo.status = 'requested' and v_user_id <> v_convo.requested_by then
    return query select false,'اقبل طلب المراسلة الأول.',null::uuid,null::uuid,null::timestamptz; return;
  end if;

  insert into public.direct_messages as dm (conversation_id, sender_id, body)
  values (v_convo.id, v_user_id, v_text)
  returning dm.id, dm.created_at into v_mid, v_created;

  update public.direct_conversations
  set last_message_at = v_created, updated_at = now()
  where id = v_convo.id;

  return query select true,'تم إرسال الرسالة.',v_mid,v_convo.id,v_created;
end;
$$;
