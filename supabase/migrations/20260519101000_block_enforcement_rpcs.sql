create or replace function public.create_story_reply_thread(
  p_story_id uuid,
  p_body text
)
returns table (conversation_id uuid, message_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid(); v_recipient_id uuid; v_conversation_id uuid; v_message_id uuid; v_body text := btrim(coalesce(p_body, ''));
begin
  if v_user_id is null then return; end if;
  if p_story_id is null or v_body = '' or char_length(v_body) > 800 then return; end if;
  select s.user_id into v_recipient_id from public.stories s where s.id = p_story_id and s.expires_at > now() limit 1;
  if v_recipient_id is null or v_recipient_id = v_user_id then return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=v_recipient_id) or (b.blocker_id=v_recipient_id and b.blocked_user_id=v_user_id)) then return; end if;
  insert into public.contextual_conversations (context_type,context_entity_id,starter_id,recipient_id) values ('story_reply',p_story_id,v_user_id,v_recipient_id)
  on conflict (context_type, context_entity_id, starter_id) do update set updated_at=now() returning id into v_conversation_id;
  insert into public.contextual_messages (conversation_id,sender_id,body) values (v_conversation_id,v_user_id,v_body) returning id into v_message_id;
  update public.contextual_conversations set updated_at=now() where id=v_conversation_id;
  conversation_id := v_conversation_id; message_id := v_message_id; return next;
end; $$;
