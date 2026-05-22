create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles(id) on delete cascade,
  participant_b uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','accepted','ignored','blocked')),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz null,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_conversations_participants_distinct check (participant_a <> participant_b),
  constraint direct_conversations_requested_by_participant check (requested_by in (participant_a, participant_b)),
  constraint direct_conversations_canonical_order check (participant_a < participant_b)
);

create unique index if not exists direct_conversations_unique_pair_idx on public.direct_conversations (participant_a, participant_b);
create index if not exists direct_conversations_participant_a_idx on public.direct_conversations (participant_a);
create index if not exists direct_conversations_participant_b_idx on public.direct_conversations (participant_b);
create index if not exists direct_conversations_status_idx on public.direct_conversations (status);
create index if not exists direct_conversations_last_message_at_idx on public.direct_conversations (last_message_at desc nulls last);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  constraint direct_messages_body_not_blank_check check (char_length(btrim(body)) > 0),
  constraint direct_messages_body_max_len_check check (char_length(body) <= 1200)
);
create index if not exists direct_messages_conversation_created_idx on public.direct_messages (conversation_id, created_at asc);
create index if not exists direct_messages_sender_idx on public.direct_messages (sender_id);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

create policy direct_conversations_select_participant on public.direct_conversations
for select to authenticated
using (auth.uid() = participant_a or auth.uid() = participant_b);

create policy direct_messages_select_participant on public.direct_messages
for select to authenticated
using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_messages.conversation_id
      and (auth.uid() = c.participant_a or auth.uid() = c.participant_b)
  )
);

revoke insert, update, delete on public.direct_conversations from anon, authenticated;
revoke insert, update, delete on public.direct_messages from anon, authenticated;

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
  if v_user_id is null then return query select false, null::uuid, null::text, false, 'تسجيل الدخول مطلوب.'; return; end if;
  if p_target_user_id is null then return query select false, null::uuid, null::text, false, 'تعذر تحديد المستخدم.'; return; end if;
  if v_user_id = p_target_user_id then return query select false, null::uuid, null::text, false, 'لا يمكنك مراسلة نفسك.'; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=p_target_user_id) or (b.blocker_id=p_target_user_id and b.blocked_user_id=v_user_id)) then
    return query select false, null::uuid, null::text, false, 'لا يمكنك بدء المراسلة مع هذا المستخدم حالياً.'; return;
  end if;
  v_a := least(v_user_id, p_target_user_id); v_b := greatest(v_user_id, p_target_user_id);

  select * into v_row from public.direct_conversations where participant_a=v_a and participant_b=v_b limit 1;
  if found then
    if v_row.status = 'blocked' then return query select false, null::uuid, null::text, false, 'المحادثة غير متاحة حالياً.'; return; end if;
    if v_row.status = 'ignored' then
      update public.direct_conversations set status='requested', requested_by=v_user_id, updated_at=now() where id=v_row.id returning * into v_row;
    end if;
    return query select true, v_row.id, v_row.status, v_row.status <> 'accepted', 'تم فتح المحادثة.'; return;
  end if;

  v_open_allowed := exists (select 1 from public.user_follows f where f.follower_id = p_target_user_id and f.followed_id = v_user_id)
    or exists (
      select 1 from public.swap_deals d where d.status='completed' and (
        (d.requester_id=v_user_id and d.offerer_id=p_target_user_id) or (d.requester_id=p_target_user_id and d.offerer_id=v_user_id)
      )
    );

  insert into public.direct_conversations (participant_a, participant_b, status, requested_by, accepted_at, created_at, updated_at)
  values (v_a, v_b, case when v_open_allowed then 'accepted' else 'requested' end, v_user_id, case when v_open_allowed then now() else null end, now(), now())
  returning * into v_row;

  return query select true, v_row.id, v_row.status, v_row.status <> 'accepted', case when v_row.status='accepted' then 'تم فتح المحادثة.' else 'تم إرسال طلب المراسلة.' end;
end;
$$;

create or replace function public.send_direct_message(p_conversation_id uuid, p_body text)
returns table (ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_convo public.direct_conversations%rowtype; v_text text := btrim(coalesce(p_body,'')); v_mid uuid; v_created timestamptz;
begin
  if v_user_id is null then return query select false,'تسجيل الدخول مطلوب.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if p_conversation_id is null then return query select false,'تعذر تحديد المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if char_length(v_text)=0 or char_length(v_text)>1200 then return query select false,'الرسالة يجب أن تكون بين 1 و1200 حرف.',null::uuid,null::uuid,null::timestamptz; return; end if;
  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) then return query select false,'غير مسموح لك بهذه المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b) or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)) then
    return query select false,'لا يمكن إرسال الرسائل حالياً.',null::uuid,null::uuid,null::timestamptz; return;
  end if;
  if v_convo.status='blocked' or v_convo.status='ignored' then return query select false,'المحادثة غير متاحة حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_convo.status='requested' and v_user_id = v_convo.requested_by then
    if exists (select 1 from public.direct_messages dm where dm.conversation_id=v_convo.id and dm.sender_id=v_user_id) then
      return query select false,'طلب المراسلة اتبعت. تقدر تكملوا الكلام بعد القبول.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
  end if;
  if v_convo.status='requested' and v_user_id <> v_convo.requested_by then
    return query select false,'اقبل طلب المراسلة الأول.',null::uuid,null::uuid,null::timestamptz; return;
  end if;
  insert into public.direct_messages (conversation_id,sender_id,body) values (v_convo.id,v_user_id,v_text) returning id,created_at into v_mid,v_created;
  update public.direct_conversations set last_message_at=v_created, updated_at=now() where id=v_convo.id;
  return query select true,'تم إرسال الرسالة.',v_mid,v_convo.id,v_created;
end; $$;

create or replace function public.accept_direct_message_request(p_conversation_id uuid)
returns table (ok boolean, message text)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_convo public.direct_conversations%rowtype;
begin
  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.'; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) or v_user_id = v_convo.requested_by then return query select false,'غير مسموح.'; return; end if;
  if v_convo.status <> 'requested' then return query select false,'حالة الطلب غير قابلة للقبول الآن.'; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b) or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)) then
    return query select false,'لا يمكن تحديث الطلب حالياً.'; return;
  end if;
  update public.direct_conversations set status='accepted', accepted_at=coalesce(accepted_at,now()), updated_at=now() where id=v_convo.id and status='requested';
  if found then return query select true,'تم قبول طلب المراسلة.'; else return query select false,'تعذر تحديث حالة الطلب.'; end if;
end; $$;
create or replace function public.ignore_direct_message_request(p_conversation_id uuid)
returns table (ok boolean, message text)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_convo public.direct_conversations%rowtype;
begin
  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.'; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) or v_user_id = v_convo.requested_by then return query select false,'غير مسموح.'; return; end if;
  if v_convo.status <> 'requested' then return query select false,'حالة الطلب غير قابلة للتجاهل الآن.'; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b) or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)) then
    return query select false,'لا يمكن تحديث الطلب حالياً.'; return;
  end if;
  update public.direct_conversations set status='ignored', updated_at=now() where id=v_convo.id and status='requested';
  if found then return query select true,'تم تجاهل الطلب.'; else return query select false,'تعذر تحديث حالة الطلب.'; end if;
end; $$;

create or replace function public.get_my_direct_conversations()
returns table (conversation_id uuid,status text,requested_by uuid,other_user_id uuid,other_display_name text,other_username text,other_avatar_url text,last_message_body text,last_message_sender_id uuid,last_message_at timestamptz,unread_count bigint,requires_action boolean)
language sql security definer set search_path = public as $$
  with mine as (
    select c.*, case when auth.uid()=c.participant_a then c.participant_b else c.participant_a end as other_id
    from public.direct_conversations c
    where auth.uid() in (c.participant_a, c.participant_b)
  ), lm as (
    select distinct on (conversation_id) conversation_id, body, sender_id, created_at from public.direct_messages order by conversation_id, created_at desc
  )
  select m.id,m.status,m.requested_by,p.id,p.display_name,p.username,p.avatar_url,lm.body,lm.sender_id,m.last_message_at,
    (select count(*) from public.direct_messages dm where dm.conversation_id=m.id and dm.sender_id<>auth.uid() and dm.read_at is null),
    (m.status='requested' and m.requested_by <> auth.uid())
  from mine m
  join public.profiles p on p.id=m.other_id
  left join lm on lm.conversation_id=m.id
  order by m.last_message_at desc nulls last, m.created_at desc;
$$;

create or replace function public.get_direct_conversation_messages(p_conversation_id uuid)
returns table (id uuid,sender_id uuid,body text,created_at timestamptz,read_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_other uuid;
begin
  if not exists (select 1 from public.direct_conversations c where c.id=p_conversation_id and v_user_id in (c.participant_a,c.participant_b)) then return; end if;
  select case when participant_a=v_user_id then participant_b else participant_a end into v_other from public.direct_conversations where id=p_conversation_id;
  update public.direct_messages set read_at=now() where conversation_id=p_conversation_id and sender_id=v_other and read_at is null;
  return query select m.id,m.sender_id,m.body,m.created_at,m.read_at from public.direct_messages m where m.conversation_id=p_conversation_id order by m.created_at asc;
end; $$;

revoke all on function public.start_or_get_direct_conversation(uuid) from public;
revoke all on function public.send_direct_message(uuid,text) from public;
revoke all on function public.accept_direct_message_request(uuid) from public;
revoke all on function public.ignore_direct_message_request(uuid) from public;
revoke all on function public.get_my_direct_conversations() from public;
revoke all on function public.get_direct_conversation_messages(uuid) from public;
grant execute on function public.start_or_get_direct_conversation(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid,text) to authenticated;
grant execute on function public.accept_direct_message_request(uuid) to authenticated;
grant execute on function public.ignore_direct_message_request(uuid) to authenticated;
grant execute on function public.get_my_direct_conversations() to authenticated;
grant execute on function public.get_direct_conversation_messages(uuid) to authenticated;
