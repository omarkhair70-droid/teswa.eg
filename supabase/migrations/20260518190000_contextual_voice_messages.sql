alter table public.contextual_messages
  add column if not exists message_kind text not null default 'text',
  add column if not exists media_storage_path text null,
  add column if not exists media_duration_ms integer null;

alter table public.contextual_messages
  drop constraint if exists contextual_messages_message_kind_check;
alter table public.contextual_messages
  add constraint contextual_messages_message_kind_check
  check (message_kind in ('text', 'voice'));

alter table public.contextual_messages
  drop constraint if exists contextual_messages_voice_shape_check;
alter table public.contextual_messages
  add constraint contextual_messages_voice_shape_check
  check (
    (message_kind = 'text' and char_length(btrim(body)) > 0 and media_storage_path is null and media_duration_ms is null)
    or
    (message_kind = 'voice' and media_storage_path is not null and btrim(media_storage_path) <> '' and media_duration_ms is not null and media_duration_ms > 0 and media_duration_ms <= 45000)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contextual-voice-messages',
  'contextual-voice-messages',
  false,
  10485760,
  array['audio/m4a','audio/mp4','audio/aac','audio/mpeg','audio/wav','audio/webm','audio/ogg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "contextual_voice_messages_select_participants"
on storage.objects
for select to authenticated
using (
  bucket_id = 'contextual-voice-messages'
  and exists (
    select 1 from public.contextual_conversations c
    where c.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (c.starter_id::text, c.recipient_id::text)
  )
);

create policy "contextual_voice_messages_insert_participant_sender"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'contextual-voice-messages'
  and split_part(storage.objects.name, '/', 1) = 'contextual'
  and split_part(storage.objects.name, '/', 3) = auth.uid()::text
  and exists (
    select 1 from public.contextual_conversations c
    where c.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (c.starter_id::text, c.recipient_id::text)
  )
);


create or replace function public.ensure_story_reply_conversation(
  p_story_id uuid
)
returns table (
  conversation_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_recipient_id uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null or p_story_id is null then
    return;
  end if;

  select s.user_id
  into v_recipient_id
  from public.stories s
  where s.id = p_story_id
    and s.expires_at > now()
  limit 1;

  if v_recipient_id is null or v_recipient_id = v_user_id then
    return;
  end if;

  insert into public.contextual_conversations (
    context_type,
    context_entity_id,
    starter_id,
    recipient_id
  ) values (
    'story_reply',
    p_story_id,
    v_user_id,
    v_recipient_id
  )
  on conflict (context_type, context_entity_id, starter_id)
  do update set updated_at = now()
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

create policy "contextual_voice_messages_delete_participant_sender"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'contextual-voice-messages'
  and split_part(storage.objects.name, '/', 1) = 'contextual'
  and split_part(storage.objects.name, '/', 3) = auth.uid()::text
  and exists (
    select 1 from public.contextual_conversations c
    where c.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (c.starter_id::text, c.recipient_id::text)
  )
);
