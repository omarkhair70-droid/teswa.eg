create or replace function public.mark_direct_conversation_read_v2(p_conversation_id uuid)
returns table(ok boolean, read_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_other uuid;
  v_now timestamptz := now();
begin
  select case when c.participant_a = v_user_id then c.participant_b else c.participant_a end
  into v_other
  from public.direct_conversations c
  where c.id = p_conversation_id
    and v_user_id in (c.participant_a, c.participant_b);

  if v_other is null then
    return query select false, null::timestamptz;
    return;
  end if;

  update public.direct_messages as dm
  set read_at = coalesce(dm.read_at, v_now)
  where dm.conversation_id = p_conversation_id
    and dm.sender_id = v_other
    and dm.read_at is null;

  return query select true, v_now;
end;
$$;

revoke all on function public.mark_direct_conversation_read_v2(uuid) from public;
grant execute on function public.mark_direct_conversation_read_v2(uuid) to authenticated;
