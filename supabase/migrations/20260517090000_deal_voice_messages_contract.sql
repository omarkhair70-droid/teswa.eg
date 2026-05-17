alter table public.deal_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists audio_storage_path text null,
  add column if not exists audio_duration_ms integer null,
  add column if not exists audio_mime_type text null,
  add column if not exists audio_size_bytes bigint null;

alter table public.deal_messages
  drop constraint if exists deal_messages_message_type_check;

alter table public.deal_messages
  add constraint deal_messages_message_type_check
  check (message_type in ('text', 'voice'));

alter table public.deal_messages
  drop constraint if exists deal_messages_voice_shape_check;

alter table public.deal_messages
  add constraint deal_messages_voice_shape_check
  check (
    (
      message_type = 'text'
      and audio_storage_path is null
      and audio_duration_ms is null
      and audio_mime_type is null
      and audio_size_bytes is null
    )
    or
    (
      message_type = 'voice'
      and audio_storage_path is not null
      and audio_duration_ms is not null
      and audio_duration_ms >= 500
      and audio_duration_ms <= 120000
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-voice-messages',
  'deal-voice-messages',
  false,
  15728640,
  array['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg']
)
on conflict (id)
do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "deal_voice_messages_select_participants"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'deal-voice-messages'
  and exists (
    select 1
    from public.swap_deals d
    where d.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (d.requester_id::text, d.offerer_id::text)
  )
);

create policy "deal_voice_messages_insert_participant_sender"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'deal-voice-messages'
  and split_part(storage.objects.name, '/', 1) = 'deals'
  and split_part(storage.objects.name, '/', 3) = auth.uid()::text
  and exists (
    select 1
    from public.swap_deals d
    where d.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (d.requester_id::text, d.offerer_id::text)
  )
);

create policy "deal_voice_messages_delete_participant_sender"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'deal-voice-messages'
  and split_part(storage.objects.name, '/', 1) = 'deals'
  and split_part(storage.objects.name, '/', 3) = auth.uid()::text
  and exists (
    select 1
    from public.swap_deals d
    where d.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (d.requester_id::text, d.offerer_id::text)
  )
);
