-- Make deleted/orphaned Direct Chat media unreadable even if a storage path leaks.
-- A user must be a conversation participant AND the object must still have a live
-- attachment row owned by that conversation.

drop policy if exists "direct_chat_media_select_participants" on storage.objects;
create policy "direct_chat_media_select_participants" on storage.objects
for select to authenticated using (
  bucket_id='direct-chat-media'
  and split_part(storage.objects.name,'/',1)='direct'
  and exists (
    select 1
    from public.direct_message_attachments a
    join public.direct_conversations c on c.id=a.conversation_id
    where a.storage_path=storage.objects.name
      and c.id::text=split_part(storage.objects.name,'/',2)
      and auth.uid() in (c.participant_a,c.participant_b)
  )
);
