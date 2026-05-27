alter table public.profiles
  add column if not exists direct_message_privacy text not null default 'everyone';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_direct_message_privacy_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_direct_message_privacy_check
      check (direct_message_privacy in ('everyone', 'followers_only', 'no_one'));
  end if;
end $$;

create or replace function public.start_or_get_direct_conversation(p_target_user_id uuid)
returns table (ok boolean, conversation_id uuid, status text, requires_request boolean, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_row public.direct_conversations%rowtype;
  v_open_allowed boolean := false;
  v_target_privacy text := 'everyone';
  v_is_following_target boolean := false;
  v_target_following_me boolean := false;
begin
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
        or exists (select 1 from public.user_follows f where f.follower_id = v_user_id and f.followed_id = p_target_user_id)
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

  select coalesce(p.direct_message_privacy, 'everyone') into v_target_privacy
  from public.profiles p
  where p.id = p_target_user_id;

  if v_target_privacy = 'no_one' then
    return query select false, null::uuid, null::text, true, 'المستخدم ده قافل طلبات المراسلة حالياً.'; return;
  end if;

  select exists (
    select 1 from public.user_follows f
    where f.follower_id = v_user_id and f.followed_id = p_target_user_id
  ) into v_is_following_target;

  select exists (
    select 1 from public.user_follows f
    where f.follower_id = p_target_user_id and f.followed_id = v_user_id
  ) into v_target_following_me;

  if v_target_privacy = 'followers_only' and not (v_is_following_target or v_target_following_me) then
    return query select false, null::uuid, null::text, true, 'المستخدم ده مستلم الرسائل من المتابعين فقط.'; return;
  end if;

  v_open_allowed :=
    v_is_following_target
    or v_target_following_me
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
