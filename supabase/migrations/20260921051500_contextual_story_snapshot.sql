alter table public.contextual_conversations
  add column if not exists context_caption_snapshot text null,
  add column if not exists context_media_type_snapshot text null,
  add column if not exists context_media_storage_path_snapshot text null,
  add column if not exists context_author_id_snapshot uuid null,
  add column if not exists context_created_at_snapshot timestamptz null;

alter table public.contextual_conversations
  drop constraint if exists contextual_conversations_context_media_type_snapshot_check;

alter table public.contextual_conversations
  add constraint contextual_conversations_context_media_type_snapshot_check
  check (
    context_media_type_snapshot is null
    or context_media_type_snapshot in ('image', 'video')
  );

update public.contextual_conversations c
set
  context_caption_snapshot = coalesce(c.context_caption_snapshot, s.caption),
  context_media_type_snapshot = coalesce(c.context_media_type_snapshot, s.media_type),
  context_media_storage_path_snapshot = coalesce(c.context_media_storage_path_snapshot, s.media_storage_path),
  context_author_id_snapshot = coalesce(c.context_author_id_snapshot, s.user_id),
  context_created_at_snapshot = coalesce(c.context_created_at_snapshot, s.created_at)
from public.stories s
where c.context_type = 'story_reply'
  and c.context_entity_id = s.id
  and (
    c.context_caption_snapshot is null
    or c.context_media_type_snapshot is null
    or c.context_media_storage_path_snapshot is null
    or c.context_author_id_snapshot is null
    or c.context_created_at_snapshot is null
  );

create or replace function public.create_story_reply_thread(
  p_story_id uuid,
  p_body text
)
returns table (conversation_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient_id uuid;
  v_caption text;
  v_media_type text;
  v_media_storage_path text;
  v_story_created_at timestamptz;
  v_conversation_id uuid;
  v_message_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_user_id is null then return; end if;
  if p_story_id is null or v_body = '' or char_length(v_body) > 800 then return; end if;

  select
    s.user_id,
    s.caption,
    s.media_type,
    s.media_storage_path,
    s.created_at
  into
    v_recipient_id,
    v_caption,
    v_media_type,
    v_media_storage_path,
    v_story_created_at
  from public.stories s
  where s.id = p_story_id
    and s.expires_at > now()
  limit 1;

  if v_recipient_id is null or v_recipient_id = v_user_id then return; end if;

  if exists (
    select 1
    from public.user_blocks b
    where
      (b.blocker_id = v_user_id and b.blocked_user_id = v_recipient_id)
      or (b.blocker_id = v_recipient_id and b.blocked_user_id = v_user_id)
  ) then
    return;
  end if;

  insert into public.contextual_conversations (
    context_type,
    context_entity_id,
    starter_id,
    recipient_id,
    context_caption_snapshot,
    context_media_type_snapshot,
    context_media_storage_path_snapshot,
    context_author_id_snapshot,
    context_created_at_snapshot
  )
  values (
    'story_reply',
    p_story_id,
    v_user_id,
    v_recipient_id,
    v_caption,
    v_media_type,
    v_media_storage_path,
    v_recipient_id,
    v_story_created_at
  )
  on conflict (context_type, context_entity_id, starter_id)
  do update set
    updated_at = now(),
    context_caption_snapshot = coalesce(
      public.contextual_conversations.context_caption_snapshot,
      excluded.context_caption_snapshot
    ),
    context_media_type_snapshot = coalesce(
      public.contextual_conversations.context_media_type_snapshot,
      excluded.context_media_type_snapshot
    ),
    context_media_storage_path_snapshot = coalesce(
      public.contextual_conversations.context_media_storage_path_snapshot,
      excluded.context_media_storage_path_snapshot
    ),
    context_author_id_snapshot = coalesce(
      public.contextual_conversations.context_author_id_snapshot,
      excluded.context_author_id_snapshot
    ),
    context_created_at_snapshot = coalesce(
      public.contextual_conversations.context_created_at_snapshot,
      excluded.context_created_at_snapshot
    )
  returning id into v_conversation_id;

  insert into public.contextual_messages (
    conversation_id,
    sender_id,
    body
  )
  values (
    v_conversation_id,
    v_user_id,
    v_body
  )
  returning id into v_message_id;

  update public.contextual_conversations
  set updated_at = now()
  where id = v_conversation_id;

  conversation_id := v_conversation_id;
  message_id := v_message_id;
  return next;
end;
$$;

revoke all on function public.create_story_reply_thread(uuid, text) from public;
grant execute on function public.create_story_reply_thread(uuid, text) to authenticated;

create or replace function public.ensure_story_reply_conversation(
  p_story_id uuid
)
returns table (conversation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient_id uuid;
  v_caption text;
  v_media_type text;
  v_media_storage_path text;
  v_story_created_at timestamptz;
  v_conversation_id uuid;
begin
  if v_user_id is null or p_story_id is null then return; end if;

  select
    s.user_id,
    s.caption,
    s.media_type,
    s.media_storage_path,
    s.created_at
  into
    v_recipient_id,
    v_caption,
    v_media_type,
    v_media_storage_path,
    v_story_created_at
  from public.stories s
  where s.id = p_story_id
    and s.expires_at > now()
  limit 1;

  if v_recipient_id is null or v_recipient_id = v_user_id then return; end if;

  if exists (
    select 1
    from public.user_blocks b
    where
      (b.blocker_id = v_user_id and b.blocked_user_id = v_recipient_id)
      or (b.blocker_id = v_recipient_id and b.blocked_user_id = v_user_id)
  ) then
    return;
  end if;

  insert into public.contextual_conversations (
    context_type,
    context_entity_id,
    starter_id,
    recipient_id,
    context_caption_snapshot,
    context_media_type_snapshot,
    context_media_storage_path_snapshot,
    context_author_id_snapshot,
    context_created_at_snapshot
  )
  values (
    'story_reply',
    p_story_id,
    v_user_id,
    v_recipient_id,
    v_caption,
    v_media_type,
    v_media_storage_path,
    v_recipient_id,
    v_story_created_at
  )
  on conflict (context_type, context_entity_id, starter_id)
  do update set
    updated_at = now(),
    context_caption_snapshot = coalesce(
      public.contextual_conversations.context_caption_snapshot,
      excluded.context_caption_snapshot
    ),
    context_media_type_snapshot = coalesce(
      public.contextual_conversations.context_media_type_snapshot,
      excluded.context_media_type_snapshot
    ),
    context_media_storage_path_snapshot = coalesce(
      public.contextual_conversations.context_media_storage_path_snapshot,
      excluded.context_media_storage_path_snapshot
    ),
    context_author_id_snapshot = coalesce(
      public.contextual_conversations.context_author_id_snapshot,
      excluded.context_author_id_snapshot
    ),
    context_created_at_snapshot = coalesce(
      public.contextual_conversations.context_created_at_snapshot,
      excluded.context_created_at_snapshot
    )
  returning id into v_conversation_id;

  update public.contextual_conversations
  set updated_at = now()
  where id = v_conversation_id;

  conversation_id := v_conversation_id;
  return next;
end;
$$;

revoke all on function public.ensure_story_reply_conversation(uuid) from public;
grant execute on function public.ensure_story_reply_conversation(uuid) to authenticated;
