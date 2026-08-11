-- Preserve voice messages created by the pre-Stream Supabase Direct Chat path.
-- New native messages use direct_message_attachments/direct-chat-media; older voice
-- rows still point at the private direct-voice-messages bucket.

create or replace function public.get_direct_native_messages(
  p_conversation_id uuid,
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table (
  id uuid,sender_id uuid,body text,message_type text,created_at timestamptz,read_at timestamptz,
  reply_to_message_id uuid,reply_sender_id uuid,reply_body text,metadata jsonb,deleted_at timestamptz,
  attachments jsonb,reactions jsonb
)
language sql security definer set search_path=public as $$
  select
    m.id,m.sender_id,
    case when m.deleted_at is null then m.body else 'تم حذف هذه الرسالة' end,
    m.message_type,m.created_at,m.read_at,m.reply_to_message_id,reply.sender_id,
    case when reply.deleted_at is null then reply.body else null end,
    m.metadata,m.deleted_at,
    case
      when m.deleted_at is not null then '[]'::jsonb
      when exists (select 1 from public.direct_message_attachments existing where existing.message_id=m.id) then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',a.id,
          'kind',a.kind,
          'storagePath',a.storage_path,
          'storageBucket','direct-chat-media',
          'fileName',a.file_name,
          'mimeType',a.mime_type,
          'sizeBytes',a.size_bytes,
          'durationMs',a.duration_ms,
          'width',a.width,
          'height',a.height
        ) order by a.created_at)
        from public.direct_message_attachments a where a.message_id=m.id
      ),'[]'::jsonb)
      when m.message_type='voice' and m.audio_storage_path is not null then jsonb_build_array(jsonb_build_object(
        'kind','audio',
        'storagePath',m.audio_storage_path,
        'storageBucket','direct-voice-messages',
        'fileName','voice.m4a',
        'mimeType',coalesce(m.audio_mime_type,'audio/m4a'),
        'sizeBytes',m.audio_size_bytes,
        'durationMs',m.audio_duration_ms
      ))
      else '[]'::jsonb
    end,
    case when m.deleted_at is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('reaction',r.reaction,'userId',r.user_id,'createdAt',r.created_at) order by r.created_at)
      from public.direct_message_reactions r where r.message_id=m.id
    ),'[]'::jsonb) end
  from public.direct_messages m
  left join public.direct_messages reply on reply.id=m.reply_to_message_id
  where m.conversation_id=p_conversation_id
    and (p_before is null or m.created_at<p_before)
    and exists (
      select 1 from public.direct_conversations c
      where c.id=p_conversation_id and auth.uid() in (c.participant_a,c.participant_b)
    )
  order by m.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),200));
$$;

revoke all on function public.get_direct_native_messages(uuid,integer,timestamptz) from public;
grant execute on function public.get_direct_native_messages(uuid,integer,timestamptz) to authenticated;
