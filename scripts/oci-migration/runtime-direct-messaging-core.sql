-- Teswa Lane 4 direct messaging core RPC port.
-- Canonical source definitions captured from live Supabase on 2026-09-06.
-- Only identity authority changes: auth.uid() -> teswa_runtime.current_user_id().
-- Rehearsal target only; no production cutover.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_direct_conversation(p_conversation_id uuid)
 RETURNS TABLE(conversation_id uuid, status text, requested_by uuid, other_user_id uuid, other_display_name text, other_username text, other_avatar_url text, last_message_body text, last_message_sender_id uuid, last_message_at timestamp with time zone, unread_count bigint, requires_action boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select c.*, case when teswa_runtime.current_user_id()=c.participant_a then c.participant_b else c.participant_a end as other_id
    from public.direct_conversations c
    where c.id = p_conversation_id
      and teswa_runtime.current_user_id() in (c.participant_a, c.participant_b)
  ), lm as (
    select m.body, m.sender_id
    from public.direct_messages m
    where m.conversation_id = p_conversation_id
    order by m.created_at desc
    limit 1
  )
  select m.id,m.status,m.requested_by,p.id,p.display_name,p.username,p.avatar_url,lm.body,lm.sender_id,m.last_message_at,
    (select count(*) from public.direct_messages dm where dm.conversation_id=m.id and dm.sender_id<>teswa_runtime.current_user_id() and dm.read_at is null),
    (m.status='requested' and m.requested_by <> teswa_runtime.current_user_id())
  from mine m
  join public.profiles p on p.id=m.other_id
  left join lm on true;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_direct_conversations()
 RETURNS TABLE(conversation_id uuid, status text, requested_by uuid, other_user_id uuid, other_display_name text, other_username text, other_avatar_url text, last_message_body text, last_message_sender_id uuid, last_message_at timestamp with time zone, unread_count bigint, requires_action boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mine as (
    select c.*, case when teswa_runtime.current_user_id()=c.participant_a then c.participant_b else c.participant_a end as other_id
    from public.direct_conversations c
    where teswa_runtime.current_user_id() in (c.participant_a, c.participant_b)
  ), lm as (
    select distinct on (conversation_id) conversation_id, body, sender_id, created_at from public.direct_messages order by conversation_id, created_at desc
  )
  select m.id,m.status,m.requested_by,p.id,p.display_name,p.username,p.avatar_url,lm.body,lm.sender_id,m.last_message_at,
    (select count(*) from public.direct_messages dm where dm.conversation_id=m.id and dm.sender_id<>teswa_runtime.current_user_id() and dm.read_at is null),
    (m.status='requested' and m.requested_by <> teswa_runtime.current_user_id())
  from mine m
  join public.profiles p on p.id=m.other_id
  left join lm on lm.conversation_id=m.id
  order by m.last_message_at desc nulls last, m.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_direct_native_messages(p_conversation_id uuid, p_limit integer DEFAULT 100, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id uuid, sender_id uuid, body text, message_type text, created_at timestamp with time zone, read_at timestamp with time zone, reply_to_message_id uuid, reply_sender_id uuid, reply_body text, metadata jsonb, deleted_at timestamp with time zone, attachments jsonb, reactions jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          'id',a.id,'kind',a.kind,'storagePath',a.storage_path,'storageBucket','direct-chat-media',
          'fileName',a.file_name,'mimeType',a.mime_type,'sizeBytes',a.size_bytes,'durationMs',a.duration_ms,
          'width',a.width,'height',a.height
        ) order by a.created_at)
        from public.direct_message_attachments a where a.message_id=m.id
      ),'[]'::jsonb)
      when m.message_type='voice' and m.audio_storage_path is not null then jsonb_build_array(jsonb_build_object(
        'kind','audio','storagePath',m.audio_storage_path,'storageBucket','direct-voice-messages',
        'fileName','voice.m4a','mimeType',coalesce(m.audio_mime_type,'audio/m4a'),
        'sizeBytes',m.audio_size_bytes,'durationMs',m.audio_duration_ms
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
      where c.id=p_conversation_id and teswa_runtime.current_user_id() in (c.participant_a,c.participant_b)
    )
  order by m.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),200));
$function$;

CREATE OR REPLACE FUNCTION public.start_or_get_direct_conversation(p_target_user_id uuid)
 RETURNS TABLE(ok boolean, conversation_id uuid, status text, requires_request boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_a uuid;
  v_b uuid;
  v_row public.direct_conversations%rowtype;
  v_open_allowed boolean := false;
  v_target_privacy text := 'everyone';
  v_is_following_target boolean := false;
  v_target_following_me boolean := false;
begin
  if v_user_id is null then return query select false, null::uuid, null::text, false, 'تسجيل الدخول مطلوب.'; return; end if;
  if p_target_user_id is null then return query select false, null::uuid, null::text, false, 'تعذر تحديد المستخدم.'; return; end if;
  if v_user_id = p_target_user_id then return query select false, null::uuid, null::text, false, 'لا يمكنك مراسلة نفسك.'; return; end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_user_id and b.blocked_user_id = p_target_user_id)
       or (b.blocker_id = p_target_user_id and b.blocked_user_id = v_user_id)
  ) then
    return query select false, null::uuid, null::text, false, 'لا يمكنك بدء المراسلة مع هذا المستخدم حالياً.'; return;
  end if;

  v_a := least(v_user_id, p_target_user_id);
  v_b := greatest(v_user_id, p_target_user_id);

  select * into v_row from public.direct_conversations where participant_a = v_a and participant_b = v_b limit 1;
  if found then
    if v_row.status = 'blocked' then return query select false, null::uuid, null::text, false, 'المحادثة غير متاحة حالياً.'; return; end if;
    if v_row.status = 'ignored' then
      update public.direct_conversations
      set status = 'requested', requested_by = v_user_id, updated_at = now()
      where id = v_row.id
      returning * into v_row;
    end if;
    if v_row.status = 'requested' then
      v_open_allowed :=
        exists (select 1 from public.user_follows f where f.follower_id = p_target_user_id and f.followed_id = v_user_id)
        or exists (select 1 from public.user_follows f where f.follower_id = v_user_id and f.followed_id = p_target_user_id)
        or exists (
          select 1
          from public.user_follows f1
          join public.user_follows f2 on f2.follower_id = p_target_user_id and f2.followed_id = v_user_id
          where f1.follower_id = v_user_id and f1.followed_id = p_target_user_id
        )
        or exists (
          select 1
          from public.swap_deals d
          where d.status in ('coordinating', 'completed_pending_confirmation', 'completed')
            and ((d.requester_id = v_user_id and d.offerer_id = p_target_user_id)
              or (d.requester_id = p_target_user_id and d.offerer_id = v_user_id))
        );
      if v_open_allowed then
        update public.direct_conversations
        set status = 'accepted', accepted_at = coalesce(accepted_at, now()), updated_at = now()
        where id = v_row.id
        returning * into v_row;
      end if;
    end if;
    return query select true, v_row.id, v_row.status, v_row.status <> 'accepted', 'تم فتح المحادثة.'; return;
  end if;

  select coalesce(p.direct_message_privacy, 'everyone') into v_target_privacy
  from public.profiles p
  where p.id = p_target_user_id;

  if v_target_privacy = 'no_one' then
    return query select false, null::uuid, null::text, true, 'المستخدم ده قافل طلبات المراسلة حالياً.'; return;
  end if;

  select exists (
    select 1 from public.user_follows f
    where f.follower_id = v_user_id and f.followed_id = p_target_user_id
  ) into v_is_following_target;

  select exists (
    select 1 from public.user_follows f
    where f.follower_id = p_target_user_id and f.followed_id = v_user_id
  ) into v_target_following_me;

  if v_target_privacy = 'followers_only' and not (v_is_following_target or v_target_following_me) then
    return query select false, null::uuid, null::text, true, 'المستخدم ده مستلم الرسائل من المتابعين فقط.'; return;
  end if;

  v_open_allowed :=
    v_is_following_target
    or v_target_following_me
    or exists (
      select 1
      from public.user_follows f1
      join public.user_follows f2 on f2.follower_id = p_target_user_id and f2.followed_id = v_user_id
      where f1.follower_id = v_user_id and f1.followed_id = p_target_user_id
    )
    or exists (
      select 1
      from public.swap_deals d
      where d.status in ('coordinating', 'completed_pending_confirmation', 'completed')
        and ((d.requester_id = v_user_id and d.offerer_id = p_target_user_id)
          or (d.requester_id = p_target_user_id and d.offerer_id = v_user_id))
    );

  insert into public.direct_conversations (participant_a, participant_b, status, requested_by, accepted_at, created_at, updated_at)
  values (v_a, v_b, case when v_open_allowed then 'accepted' else 'requested' end, v_user_id, case when v_open_allowed then now() else null end, now(), now())
  returning * into v_row;

  return query select true, v_row.id, v_row.status, v_row.status <> 'accepted', case when v_row.status = 'accepted' then 'تم فتح المحادثة.' else 'تم إرسال طلب المراسلة.' end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_direct_native_message(p_conversation_id uuid, p_body text DEFAULT NULL::text, p_reply_to_message_id uuid DEFAULT NULL::uuid, p_attachments jsonb DEFAULT '[]'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
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
end; $function$;

CREATE OR REPLACE FUNCTION public.start_direct_conversation_with_message(p_target_user_id uuid, p_body text)
 RETURNS TABLE(ok boolean, message text, conversation_id uuid, message_id uuid, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_text text := btrim(coalesce(p_body, ''));
  v_start record;
  v_send record;
  v_requested_by uuid;
begin
  if v_user_id is null then
    return query select false, 'تسجيل الدخول مطلوب.', null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if p_target_user_id is null then
    return query select false, 'تعذر تحديد المستخدم.', null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if char_length(v_text) = 0 or char_length(v_text) > 1200 then
    return query select false, 'الرسالة يجب أن تكون بين 1 و1200 حرف.', null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select * into v_start from public.start_or_get_direct_conversation(p_target_user_id) limit 1;
  if v_start is null or not coalesce(v_start.ok, false) or v_start.conversation_id is null then
    return query select false, coalesce(v_start.message, 'تعذر فتح المراسلة حالياً.'), null::uuid, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  select c.requested_by into v_requested_by from public.direct_conversations c where c.id = v_start.conversation_id;
  if v_start.status = 'requested' and v_requested_by is distinct from v_user_id then
    return query select false, 'عندك طلب مراسلة من المستخدم ده.', v_start.conversation_id, null::uuid, v_start.status, null::timestamptz;
    return;
  end if;

  select * into v_send from public.send_direct_native_message(
    v_start.conversation_id, v_text, null, '[]'::jsonb, jsonb_build_object('request_entry', true)
  ) limit 1;

  if v_send is null or not coalesce(v_send.ok, false) then
    delete from public.direct_conversations c
    where c.id = v_start.conversation_id
      and c.status = 'requested'
      and c.requested_by = v_user_id
      and c.last_message_at is null
      and not exists (select 1 from public.direct_messages dm where dm.conversation_id = c.id);
    return query select false, coalesce(v_send.message, 'تعذر إرسال الرسالة حالياً.'), v_start.conversation_id, null::uuid, v_start.status, null::timestamptz;
    return;
  end if;

  return query select true,
    case when v_start.status = 'accepted' then 'تم إرسال الرسالة.' else 'تم إرسال طلب المراسلة.' end,
    v_start.conversation_id, v_send.message_id, v_start.status, v_send.created_at;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_direct_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_direct_conversations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_direct_native_messages(uuid,integer,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_or_get_direct_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_direct_native_message(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_direct_conversation_with_message(uuid,text) FROM PUBLIC;

COMMIT;
