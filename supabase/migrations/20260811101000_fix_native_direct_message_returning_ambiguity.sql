-- Fix a production-blocking ambiguity in send_direct_native_message.
-- The RETURNS TABLE output column `created_at` collided with the unqualified
-- `created_at` in INSERT ... RETURNING, causing PostgreSQL error 42702.

create or replace function public.send_direct_native_message(
  p_conversation_id uuid,
  p_body text default null,
  p_reply_to_message_id uuid default null,
  p_attachments jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns table (ok boolean,message text,message_id uuid,conversation_id uuid,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid := auth.uid();
  v_convo public.direct_conversations%rowtype;
  v_text text := btrim(coalesce(p_body,''));
  v_attachment jsonb;
  v_count integer;
  v_first_kind text := '';
  v_preview text;
  v_mid uuid;
  v_created timestamptz;
  v_message_type text := 'text';
  v_audio_path text;
  v_audio_mime text;
  v_audio_duration integer;
  v_audio_size bigint;
  v_reply_to_message_id uuid := p_reply_to_message_id;
begin
  if v_user_id is null then return query select false,'تسجيل الدخول مطلوب.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if p_conversation_id is null then return query select false,'تعذر تحديد المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_user_id not in (v_convo.participant_a,v_convo.participant_b) then return query select false,'غير مسموح لك بهذه المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b)
       or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)
  ) then return query select false,'لا يمكن إرسال الرسائل حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_convo.status in ('blocked','ignored') then return query select false,'المحادثة غير متاحة حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if jsonb_typeof(coalesce(p_attachments,'[]'::jsonb)) <> 'array' then return query select false,'بيانات المرفقات غير صالحة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  v_count := jsonb_array_length(coalesce(p_attachments,'[]'::jsonb));
  if v_count > 5 then return query select false,'يمكن إرسال حتى 5 مرفقات في الرسالة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if char_length(v_text)>1200 then return query select false,'الرسالة يجب ألا تتجاوز 1200 حرف.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_text='' and v_count=0 then return query select false,'اكتب رسالة أو أضف مرفقاً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' or octet_length(coalesce(p_metadata,'{}'::jsonb)::text)>8192 then return query select false,'بيانات الرسالة غير صالحة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if v_convo.status='requested' then
    if v_user_id<>v_convo.requested_by then return query select false,'اقبل طلب المراسلة الأول.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if exists (select 1 from public.direct_messages dm where dm.conversation_id=v_convo.id and dm.sender_id=v_user_id) then return query select false,'طلب المراسلة اتبعت. هتكملوا الكلام لما الطلب يتقبل.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if v_count>0 or v_reply_to_message_id is not null then return query select false,'الطلب الأول يدعم رسالة نصية فقط.',null::uuid,null::uuid,null::timestamptz; return; end if;
  end if;

  if v_reply_to_message_id is not null and not exists (
    select 1
    from public.direct_messages dm
    where dm.id=v_reply_to_message_id
      and dm.conversation_id=p_conversation_id
      and dm.deleted_at is null
  ) then
    v_reply_to_message_id := null;
  end if;

  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    if coalesce(v_attachment->>'kind','') not in ('image','video','file','audio') then return query select false,'نوع مرفق غير مدعوم.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if coalesce(v_attachment->>'storagePath','') not like ('direct/'||p_conversation_id::text||'/'||v_user_id::text||'/%') then return query select false,'مسار المرفق غير صالح.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if nullif(v_attachment->>'sizeBytes','') is not null and (v_attachment->>'sizeBytes')::bigint>52428800 then return query select false,'حجم المرفق أكبر من الحد المسموح.',null::uuid,null::uuid,null::timestamptz; return; end if;
  end loop;

  if v_count>0 then v_first_kind:=coalesce(p_attachments->0->>'kind',''); end if;
  v_preview := case when v_text<>'' then v_text when v_first_kind='image' then 'صورة' when v_first_kind='video' then 'فيديو' when v_first_kind='audio' then 'رسالة صوتية' else 'ملف' end;

  if v_count=1 and v_first_kind='audio' and v_text='' then
    v_message_type:='voice';
    v_audio_path:=p_attachments->0->>'storagePath';
    v_audio_mime:=nullif(p_attachments->0->>'mimeType','');
    v_audio_duration:=nullif(p_attachments->0->>'durationMs','')::integer;
    v_audio_size:=nullif(p_attachments->0->>'sizeBytes','')::bigint;
  end if;

  insert into public.direct_messages as dm (
    conversation_id,sender_id,body,message_type,audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes,
    reply_to_message_id,metadata
  ) values (
    p_conversation_id,v_user_id,v_preview,v_message_type,v_audio_path,v_audio_duration,v_audio_mime,v_audio_size,
    v_reply_to_message_id,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('native_v2',true)
  ) returning dm.id,dm.created_at into v_mid,v_created;

  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    insert into public.direct_message_attachments (
      conversation_id,message_id,uploader_id,kind,storage_path,file_name,mime_type,size_bytes,duration_ms,width,height
    ) values (
      p_conversation_id,v_mid,v_user_id,v_attachment->>'kind',v_attachment->>'storagePath',
      nullif(v_attachment->>'fileName',''),nullif(v_attachment->>'mimeType',''),nullif(v_attachment->>'sizeBytes','')::bigint,
      nullif(v_attachment->>'durationMs','')::integer,nullif(v_attachment->>'width','')::integer,nullif(v_attachment->>'height','')::integer
    );
  end loop;

  update public.direct_conversations set last_message_at=v_created,updated_at=now() where id=p_conversation_id;
  return query select true,'تم إرسال الرسالة.',v_mid,p_conversation_id,v_created;
end; $$;
