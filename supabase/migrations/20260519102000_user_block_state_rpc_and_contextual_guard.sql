create or replace function public.get_user_block_state(p_target_user_id uuid)
returns table (
  blocked_by_me boolean,
  blocked_me boolean,
  is_blocked_either_direction boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_blocked_by_me boolean := false;
  v_blocked_me boolean := false;
begin
  if v_user_id is null or p_target_user_id is null or v_user_id = p_target_user_id then
    blocked_by_me := false;
    blocked_me := false;
    is_blocked_either_direction := false;
    return next;
    return;
  end if;

  select exists(select 1 from public.user_blocks b where b.blocker_id = v_user_id and b.blocked_user_id = p_target_user_id) into v_blocked_by_me;
  select exists(select 1 from public.user_blocks b where b.blocker_id = p_target_user_id and b.blocked_user_id = v_user_id) into v_blocked_me;

  blocked_by_me := v_blocked_by_me;
  blocked_me := v_blocked_me;
  is_blocked_either_direction := v_blocked_by_me or v_blocked_me;
  return next;
end;
$$;

revoke all on function public.get_user_block_state(uuid) from public;
grant execute on function public.get_user_block_state(uuid) to authenticated;

create or replace function public.ensure_story_reply_conversation(
  p_story_id uuid
)
returns table (conversation_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient_id uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null or p_story_id is null then return; end if;

  select s.user_id into v_recipient_id from public.stories s where s.id = p_story_id and s.expires_at > now() limit 1;
  if v_recipient_id is null or v_recipient_id = v_user_id then return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=v_recipient_id) or (b.blocker_id=v_recipient_id and b.blocked_user_id=v_user_id)) then return; end if;

  insert into public.contextual_conversations (context_type, context_entity_id, starter_id, recipient_id)
  values ('story_reply', p_story_id, v_user_id, v_recipient_id)
  on conflict (context_type, context_entity_id, starter_id)
  do update set updated_at = now()
  returning id into v_conversation_id;

  update public.contextual_conversations set updated_at = now() where id = v_conversation_id;
  conversation_id := v_conversation_id;
  return next;
end;
$$;

revoke all on function public.ensure_story_reply_conversation(uuid) from public;
grant execute on function public.ensure_story_reply_conversation(uuid) to authenticated;
