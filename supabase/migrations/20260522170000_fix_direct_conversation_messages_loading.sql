create or replace function public.get_direct_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_other uuid;
begin
  if v_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.direct_conversations c
    where c.id = p_conversation_id
      and v_user_id in (c.participant_a, c.participant_b)
  ) then
    return;
  end if;

  select case
    when c.participant_a = v_user_id then c.participant_b
    else c.participant_a
  end
  into v_other
  from public.direct_conversations c
  where c.id = p_conversation_id;

  update public.direct_messages dm
  set read_at = now()
  where dm.conversation_id = p_conversation_id
    and dm.sender_id = v_other
    and dm.read_at is null;

  return query
  select
    dm.id,
    dm.sender_id,
    dm.body,
    dm.created_at,
    dm.read_at
  from public.direct_messages dm
  where dm.conversation_id = p_conversation_id
  order by dm.created_at asc;
end;
$$;

revoke all on function public.get_direct_conversation_messages(uuid) from public;
revoke all on function public.get_direct_conversation_messages(uuid) from anon;
grant execute on function public.get_direct_conversation_messages(uuid) to authenticated;
