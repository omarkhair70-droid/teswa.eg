-- Complete first-party Direct Chat delivery boundaries before production cutover.

-- Media uploads are only allowed for active accepted conversations with no block.
drop policy if exists "direct_chat_media_insert_sender" on storage.objects;
create policy "direct_chat_media_insert_sender" on storage.objects
for insert to authenticated with check (
  bucket_id='direct-chat-media'
  and split_part(storage.objects.name,'/',1)='direct'
  and split_part(storage.objects.name,'/',3)=auth.uid()::text
  and exists (
    select 1
    from public.direct_conversations c
    where c.id::text=split_part(storage.objects.name,'/',2)
      and c.status='accepted'
      and auth.uid() in (c.participant_a,c.participant_b)
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id=c.participant_a and b.blocked_user_id=c.participant_b)
           or (b.blocker_id=c.participant_b and b.blocked_user_id=c.participant_a)
      )
  )
);

-- An attachment row must point to an object that really exists in the private
-- Direct Chat bucket under the same conversation/uploader path.
create or replace function public.validate_direct_message_attachment_object_v2()
returns trigger
language plpgsql security definer set search_path=public,storage as $$
begin
  if new.storage_path not like ('direct/'||new.conversation_id::text||'/'||new.uploader_id::text||'/%') then
    raise exception 'invalid_direct_attachment_path';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='direct-chat-media'
      and o.name=new.storage_path
  ) then
    raise exception 'direct_attachment_object_missing';
  end if;

  return new;
end; $$;

drop trigger if exists direct_message_attachment_object_guard_v2 on public.direct_message_attachments;
create trigger direct_message_attachment_object_guard_v2
before insert or update of storage_path,conversation_id,uploader_id
on public.direct_message_attachments
for each row execute function public.validate_direct_message_attachment_object_v2();

-- Native Direct Chat notifications no longer depend on Stream webhooks.
-- Requested conversations are intentionally excluded; request notification/state
-- continues to be owned by the existing request flow.
create or replace function public.notify_direct_message_insert_v2()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_convo public.direct_conversations%rowtype;
  v_receiver uuid;
  v_body text;
begin
  select * into v_convo from public.direct_conversations where id=new.conversation_id;
  if not found or v_convo.status<>'accepted' then return new; end if;
  if new.sender_id not in (v_convo.participant_a,v_convo.participant_b) then return new; end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b)
       or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)
  ) then return new; end if;

  v_receiver := case when new.sender_id=v_convo.participant_a then v_convo.participant_b else v_convo.participant_a end;
  if v_receiver is null or v_receiver=new.sender_id then return new; end if;

  v_body := case
    when new.message_type='voice' then 'وصلك رسالة صوتية.'
    when coalesce(btrim(new.body),'')<>'' then left(btrim(new.body),80)
    else 'وصلك رسالة مباشرة.'
  end;

  begin
    insert into public.notifications (user_id,actor_user_id,type,title,body,route)
    values (v_receiver,new.sender_id,'direct_message_received','رسالة جديدة على تِسوى',v_body,'/direct/'||new.conversation_id::text);
  exception when others then
    -- Notification delivery must never roll back the chat message itself.
    null;
  end;

  return new;
end; $$;

drop trigger if exists direct_message_insert_notification_v2 on public.direct_messages;
create trigger direct_message_insert_notification_v2
after insert on public.direct_messages
for each row execute function public.notify_direct_message_insert_v2();

revoke all on function public.validate_direct_message_attachment_object_v2() from public;
revoke all on function public.notify_direct_message_insert_v2() from public;
