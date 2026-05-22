create or replace function public.get_direct_conversation(p_conversation_id uuid)
returns table (conversation_id uuid,status text,requested_by uuid,other_user_id uuid,other_display_name text,other_username text,other_avatar_url text,last_message_body text,last_message_sender_id uuid,last_message_at timestamptz,unread_count bigint,requires_action boolean)
language sql security definer set search_path = public as $$
  with mine as (
    select c.*, case when auth.uid()=c.participant_a then c.participant_b else c.participant_a end as other_id
    from public.direct_conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.participant_a, c.participant_b)
  ), lm as (
    select m.body, m.sender_id
    from public.direct_messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at desc
    limit 1
  )
  select m.id,m.status,m.requested_by,p.id,p.display_name,p.username,p.avatar_url,lm.body,lm.sender_id,m.last_message_at,
    (select count(*) from public.direct_messages dm where dm.conversation_id=m.id and dm.sender_id<>auth.uid() and dm.read_at is null),
    (m.status='requested' and m.requested_by <> auth.uid())
  from mine m
  join public.profiles p on p.id=m.other_id
  left join lm on true;
$$;

revoke all on function public.get_direct_conversation(uuid) from public;
grant execute on function public.get_direct_conversation(uuid) to authenticated;
