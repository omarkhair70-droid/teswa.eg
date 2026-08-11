-- Supabase-native Direct Chat V2 foundation.
-- This migration is additive: existing Stream-backed production chat keeps working
-- while Teswa gains first-party parity primitives in parallel.

alter table public.direct_messages
  add column if not exists reply_to_message_id uuid null references public.direct_messages(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references public.profiles(id) on delete set null;

create index if not exists direct_messages_reply_idx on public.direct_messages (reply_to_message_id);
create index if not exists direct_messages_deleted_idx on public.direct_messages (conversation_id, deleted_at);

create table if not exists public.direct_message_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('image','video','file','audio')),
  storage_path text not null unique,
  file_name text null,
  mime_type text null,
  size_bytes bigint null check (size_bytes is null or size_bytes between 0 and 52428800),
  duration_ms integer null check (duration_ms is null or duration_ms between 0 and 3600000),
  width integer null check (width is null or width > 0),
  height integer null check (height is null or height > 0),
  created_at timestamptz not null default now()
);
create index if not exists direct_message_attachments_conversation_idx on public.direct_message_attachments (conversation_id, created_at);
create index if not exists direct_message_attachments_message_idx on public.direct_message_attachments (message_id, created_at);

create table if not exists public.direct_message_reactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('love','thumbs_up')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);
create index if not exists direct_message_reactions_conversation_idx on public.direct_message_reactions (conversation_id, created_at);
create index if not exists direct_message_reactions_message_idx on public.direct_message_reactions (message_id, created_at);

create table if not exists public.direct_typing_state (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_typing boolean not null default true,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 seconds'),
  primary key (conversation_id, user_id)
);
create index if not exists direct_typing_state_expiry_idx on public.direct_typing_state (expires_at);

alter table public.direct_message_attachments enable row level security;
alter table public.direct_message_reactions enable row level security;
alter table public.direct_typing_state enable row level security;

revoke insert, update, delete on public.direct_message_attachments from anon, authenticated;
revoke insert, update, delete on public.direct_message_reactions from anon, authenticated;
revoke insert, update, delete on public.direct_typing_state from anon, authenticated;
grant select on public.direct_message_attachments to authenticated;
grant select on public.direct_message_reactions to authenticated;
grant select on public.direct_typing_state to authenticated;

drop policy if exists direct_message_attachments_select_participants on public.direct_message_attachments;
create policy direct_message_attachments_select_participants on public.direct_message_attachments
for select to authenticated using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_message_attachments.conversation_id
      and auth.uid() in (c.participant_a, c.participant_b)
  )
);

drop policy if exists direct_message_reactions_select_participants on public.direct_message_reactions;
create policy direct_message_reactions_select_participants on public.direct_message_reactions
for select to authenticated using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_message_reactions.conversation_id
      and auth.uid() in (c.participant_a, c.participant_b)
  )
);

drop policy if exists direct_typing_state_select_participants on public.direct_typing_state;
create policy direct_typing_state_select_participants on public.direct_typing_state
for select to authenticated using (
  exists (
    select 1 from public.direct_conversations c
    where c.id = direct_typing_state.conversation_id
      and auth.uid() in (c.participant_a, c.participant_b)
  )
);

-- One private bucket for native Direct Chat images, video, files and future voice.
insert into storage.buckets (id, name, public, file_size_limit)
values ('direct-chat-media', 'direct-chat-media', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "direct_chat_media_select_participants" on storage.objects;
create policy "direct_chat_media_select_participants"
on storage.objects for select to authenticated
using (
  bucket_id = 'direct-chat-media'
  and split_part(storage.objects.name, '/', 1) = 'direct'
  and exists (
    select 1 from public.direct_conversations c
    where c.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (c.participant_a::text, c.participant_b::text)
  )
);

drop policy if exists "direct_chat_media_insert_sender" on storage.objects;
create policy "direct_chat_media_insert_sender"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'direct-chat-media'
  and split_part(storage.objects.name, '/', 1) = 'direct'
  and split_part(storage.objects.name, '/', 3) = auth.uid()::text
  and exists (
    select 1 from public.direct_conversations c
    where c.id::text = split_part(storage.objects.name, '/', 2)
      and auth.uid()::text in (c.participant_a::text, c.participant_b::text)
  )
);

drop policy if exists "direct_chat_media_delete_sender" on storage.objects;
create policy "direct_chat_media_delete_sender"
on storage.objects for delete to authenticated
using (
  bucket_id = 'direct-chat-media'
  and split_part(storage.objects.name, '/', 1) = 'direct'
  and split_part(storage.objects.name, '/', 3) = auth.uid()::text
);

create or replace function public.send_direct_native_message(
  p_conversation_id uuid,
  p_body text default null,
  p_reply_to_message_id uuid default null,
  p_attachments jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns table (ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_convo public.direct_conversations%rowtype;
  v_text text := btrim(coalesce(p_body, ''));
  v_attachment jsonb;
  v_attachment_count integer := 0;
  v_first_kind text := '';
  v_preview text;
  v_mid uuid;
  v_created timestamptz;
  v_message_type text := 'text';
  v_audio_path text := null;
  v_audio_mime text := null;
  v_audio_duration integer := null;
  v_audio_size bigint := null;
begin
  if v_user_id is null then return query select false,'تسجيل الدخول مطلوب.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if p_conversation_id is null then return query select false,'تعذر تحديد المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  select * into v_convo from public.direct_conversations where id = p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) then return query select false,'غير مسموح لك بهذه المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b)
       or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)
  ) then return query select false,'لا يمكن إرسال الرسائل حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_convo.status in ('blocked','ignored') then return query select false,'المحادثة غير متاحة حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    return query select false,'بيانات المرفقات غير صالحة.',null::uuid,null::uuid,null::timestamptz; return;
  end if;
  v_attachment_count := jsonb_array_length(coalesce(p_attachments, '[]'::jsonb));
  if v_attachment_count > 5 then return query select false,'يمكن إرسال حتى 5 مرفقات في الرسالة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if char_length(v_text) > 1200 then return query select false,'الرسالة يجب ألا تتجاوز 1200 حرف.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_text = '' and v_attachment_count = 0 then return query select false,'اكتب رسالة أو أضف مرفقاً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 8192 then
    return query select false,'بيانات الرسالة غير صالحة.',null::uuid,null::uuid,null::timestamptz; return;
  end if;

  if v_convo.status = 'requested' then
    if v_user_id <> v_convo.requested_by then return query select false,'اقبل طلب المراسلة الأول.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if exists (select 1 from public.direct_messages dm where dm.conversation_id=v_convo.id and dm.sender_id=v_user_id) then
      return query select false,'طلب المراسلة اتبعت. هتكملوا الكلام لما الطلب يتقبل.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
    if v_attachment_count > 0 or p_reply_to_message_id is not null then
      return query select false,'الطلب الأول يدعم رسالة نصية فقط.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
  end if;

  if p_reply_to_message_id is not null and not exists (
    select 1 from public.direct_messages dm
    where dm.id = p_reply_to_message_id
      and dm.conversation_id = p_conversation_id
      and dm.deleted_at is null
  ) then
    return query select false,'الرسالة التي ترد عليها غير متاحة.',null::uuid,null::uuid,null::timestamptz; return;
  end if;

  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if coalesce(v_attachment->>'kind','') not in ('image','video','file','audio') then
      return query select false,'نوع مرفق غير مدعوم.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
    if coalesce(v_attachment->>'storagePath','') not like ('direct/' || p_conversation_id::text || '/' || v_user_id::text || '/%') then
      return query select false,'مسار المرفق غير صالح.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
    if nullif(v_attachment->>'sizeBytes','') is not null and (v_attachment->>'sizeBytes')::bigint > 52428800 then
      return query select false,'حجم المرفق أكبر من الحد المسموح.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
  end loop;

  if v_attachment_count > 0 then
    v_first_kind := coalesce(p_attachments->0->>'kind','');
  end if;
  if v_text <> '' then
    v_preview := v_text;
  else
    v_preview := case v_first_kind when 'image' then 'صورة' when 'video' then 'فيديو' when 'audio' then 'رسالة صوتية' else 'ملف' end;
  end if;

  if v_attachment_count = 1 and v_first_kind = 'audio' and v_text = '' then
    v_message_type := 'voice';
    v_audio_path := p_attachments->0->>'storagePath';
    v_audio_mime := nullif(p_attachments->0->>'mimeType','');
    v_audio_duration := nullif(p_attachments->0->>'durationMs','')::integer;
    v_audio_size := nullif(p_attachments->0->>'sizeBytes','')::bigint;
  end if;

  insert into public.direct_messages (
    conversation_id, sender_id, body, message_type,
    audio_storage_path, audio_duration_ms, audio_mime_type, audio_size_bytes,
    reply_to_message_id, metadata
  ) values (
    p_conversation_id, v_user_id, v_preview, v_message_type,
    v_audio_path, v_audio_duration, v_audio_mime, v_audio_size,
    p_reply_to_message_id, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('native_v2', true)
  ) returning id, created_at into v_mid, v_created;

  if v_attachment_count > 0 then
    insert into public.direct_message_attachments (
      conversation_id, message_id, uploader_id, kind, storage_path,
      file_name, mime_type, size_bytes, duration_ms, width, height
    )
    select
      p_conversation_id,
      v_mid,
      v_user_id,
      x.kind,
      x.storage_path,
      x.file_name,
      x.mime_type,
      x.size_bytes,
      x.duration_ms,
      x.width,
      x.height
    from jsonb_to_recordset(p_attachments) as x(
      kind text,
      "storagePath" text,
      "fileName" text,
      "mimeType" text,
      "sizeBytes" bigint,
      "durationMs" integer,
      width integer,
      height integer,
      storage_path text,
      file_name text,
      mime_type text,
      size_bytes bigint,
      duration_ms integer
    );

    -- jsonb_to_recordset preserves camelCase field names only when quoted.
    update public.direct_message_attachments a
      set storage_path = coalesce(a.storage_path, p_attachments->0->>'storagePath')
      where a.message_id = v_mid and a.storage_path is null;
  end if;

  update public.direct_conversations
    set last_message_at=v_created, updated_at=now()
    where id=p_conversation_id;

  return query select true,'تم إرسال الرسالة.',v_mid,p_conversation_id,v_created;
exception
  when others then
    raise warning 'send_direct_native_message failed: %', sqlerrm;
    return query select false,'تعذر إرسال الرسالة حالياً.',null::uuid,null::uuid,null::timestamptz;
end; $$;

-- Replace the function above with a compact, reliable attachment insert that reads camelCase JSON explicitly.
create or replace function public.send_direct_native_message(
  p_conversation_id uuid,
  p_body text default null,
  p_reply_to_message_id uuid default null,
  p_attachments jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns table (ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_convo public.direct_conversations%rowtype;
  v_text text := btrim(coalesce(p_body, ''));
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
begin
  if v_user_id is null then return query select false,'تسجيل الدخول مطلوب.',null::uuid,null::uuid,null::timestamptz; return; end if;
  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_user_id not in (v_convo.participant_a,v_convo.participant_b) then return query select false,'غير مسموح لك بهذه المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b) or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)) then return query select false,'لا يمكن إرسال الرسائل حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_convo.status in ('blocked','ignored') then return query select false,'المحادثة غير متاحة حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if jsonb_typeof(coalesce(p_attachments,'[]'::jsonb)) <> 'array' then return query select false,'بيانات المرفقات غير صالحة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  v_count := jsonb_array_length(coalesce(p_attachments,'[]'::jsonb));
  if v_count > 5 then return query select false,'يمكن إرسال حتى 5 مرفقات في الرسالة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if char_length(v_text) > 1200 then return query select false,'الرسالة يجب ألا تتجاوز 1200 حرف.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_text='' and v_count=0 then return query select false,'اكتب رسالة أو أضف مرفقاً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' or octet_length(coalesce(p_metadata,'{}'::jsonb)::text) > 8192 then return query select false,'بيانات الرسالة غير صالحة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if v_convo.status='requested' then
    if v_user_id <> v_convo.requested_by then return query select false,'اقبل طلب المراسلة الأول.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if exists (select 1 from public.direct_messages dm where dm.conversation_id=v_convo.id and dm.sender_id=v_user_id) then return query select false,'طلب المراسلة اتبعت. هتكملوا الكلام لما الطلب يتقبل.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if v_count>0 or p_reply_to_message_id is not null then return query select false,'الطلب الأول يدعم رسالة نصية فقط.',null::uuid,null::uuid,null::timestamptz; return; end if;
  end if;

  if p_reply_to_message_id is not null and not exists (select 1 from public.direct_messages dm where dm.id=p_reply_to_message_id and dm.conversation_id=p_conversation_id and dm.deleted_at is null) then return query select false,'الرسالة التي ترد عليها غير متاحة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    if coalesce(v_attachment->>'kind','') not in ('image','video','file','audio') then return query select false,'نوع مرفق غير مدعوم.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if coalesce(v_attachment->>'storagePath','') not like ('direct/'||p_conversation_id::text||'/'||v_user_id::text||'/%') then return query select false,'مسار المرفق غير صالح.',null::uuid,null::uuid,null::timestamptz; return; end if;
    if nullif(v_attachment->>'sizeBytes','') is not null and (v_attachment->>'sizeBytes')::bigint > 52428800 then return query select false,'حجم المرفق أكبر من الحد المسموح.',null::uuid,null::uuid,null::timestamptz; return; end if;
  end loop;

  if v_count>0 then v_first_kind := coalesce(p_attachments->0->>'kind',''); end if;
  v_preview := case when v_text<>'' then v_text when v_first_kind='image' then 'صورة' when v_first_kind='video' then 'فيديو' when v_first_kind='audio' then 'رسالة صوتية' else 'ملف' end;
  if v_count=1 and v_first_kind='audio' and v_text='' then
    v_message_type := 'voice';
    v_audio_path := p_attachments->0->>'storagePath';
    v_audio_mime := nullif(p_attachments->0->>'mimeType','');
    v_audio_duration := nullif(p_attachments->0->>'durationMs','')::integer;
    v_audio_size := nullif(p_attachments->0->>'sizeBytes','')::bigint;
  end if;

  insert into public.direct_messages (conversation_id,sender_id,body,message_type,audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes,reply_to_message_id,metadata)
  values (p_conversation_id,v_user_id,v_preview,v_message_type,v_audio_path,v_audio_duration,v_audio_mime,v_audio_size,p_reply_to_message_id,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('native_v2',true))
  returning id,created_at into v_mid,v_created;

  for v_attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    insert into public.direct_message_attachments (conversation_id,message_id,uploader_id,kind,storage_path,file_name,mime_type,size_bytes,duration_ms,width,height)
    values (
      p_conversation_id,
      v_mid,
      v_user_id,
      v_attachment->>'kind',
      v_attachment->>'storagePath',
      nullif(v_attachment->>'fileName',''),
      nullif(v_attachment->>'mimeType',''),
      nullif(v_attachment->>'sizeBytes','')::bigint,
      nullif(v_attachment->>'durationMs','')::integer,
      nullif(v_attachment->>'width','')::integer,
      nullif(v_attachment->>'height','')::integer
    );
  end loop;

  update public.direct_conversations set last_message_at=v_created,updated_at=now() where id=p_conversation_id;
  return query select true,'تم إرسال الرسالة.',v_mid,p_conversation_id,v_created;
end; $$;

create or replace function public.get_direct_native_messages(
  p_conversation_id uuid,
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  message_type text,
  created_at timestamptz,
  read_at timestamptz,
  reply_to_message_id uuid,
  reply_sender_id uuid,
  reply_body text,
  metadata jsonb,
  deleted_at timestamptz,
  attachments jsonb,
  reactions jsonb
)
language sql security definer set search_path = public as $$
  select
    m.id,
    m.sender_id,
    case when m.deleted_at is null then m.body else 'تم حذف هذه الرسالة' end,
    m.message_type,
    m.created_at,
    m.read_at,
    m.reply_to_message_id,
    reply.sender_id,
    case when reply.deleted_at is null then reply.body else null end,
    m.metadata,
    m.deleted_at,
    case when m.deleted_at is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'kind',a.kind,'storagePath',a.storage_path,'fileName',a.file_name,
        'mimeType',a.mime_type,'sizeBytes',a.size_bytes,'durationMs',a.duration_ms,
        'width',a.width,'height',a.height
      ) order by a.created_at)
      from public.direct_message_attachments a where a.message_id=m.id
    ),'[]'::jsonb) end,
    case when m.deleted_at is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('reaction',r.reaction,'userId',r.user_id,'createdAt',r.created_at) order by r.created_at)
      from public.direct_message_reactions r where r.message_id=m.id
    ),'[]'::jsonb) end
  from public.direct_messages m
  left join public.direct_messages reply on reply.id=m.reply_to_message_id
  where m.conversation_id=p_conversation_id
    and (p_before is null or m.created_at < p_before)
    and exists (
      select 1 from public.direct_conversations c
      where c.id=p_conversation_id and auth.uid() in (c.participant_a,c.participant_b)
    )
  order by m.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),200));
$$;

create or replace function public.mark_direct_conversation_read_v2(p_conversation_id uuid)
returns table (ok boolean, read_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_other uuid; v_now timestamptz := now();
begin
  select case when c.participant_a=v_user_id then c.participant_b else c.participant_a end into v_other
  from public.direct_conversations c where c.id=p_conversation_id and v_user_id in (c.participant_a,c.participant_b);
  if v_other is null then return query select false,null::timestamptz; return; end if;
  update public.direct_messages set read_at=coalesce(read_at,v_now) where conversation_id=p_conversation_id and sender_id=v_other and read_at is null;
  return query select true,v_now;
end; $$;

create or replace function public.toggle_direct_message_reaction_v2(p_message_id uuid,p_reaction text)
returns table (ok boolean, enabled boolean, reaction_count bigint)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_conversation_id uuid; v_enabled boolean;
begin
  if p_reaction not in ('love','thumbs_up') then return query select false,false,0::bigint; return; end if;
  select dm.conversation_id into v_conversation_id from public.direct_messages dm
  join public.direct_conversations c on c.id=dm.conversation_id
  where dm.id=p_message_id and dm.deleted_at is null and v_user_id in (c.participant_a,c.participant_b);
  if v_conversation_id is null then return query select false,false,0::bigint; return; end if;
  if exists (select 1 from public.direct_message_reactions r where r.message_id=p_message_id and r.user_id=v_user_id and r.reaction=p_reaction) then
    delete from public.direct_message_reactions where message_id=p_message_id and user_id=v_user_id and reaction=p_reaction;
    v_enabled := false;
  else
    insert into public.direct_message_reactions (conversation_id,message_id,user_id,reaction) values (v_conversation_id,p_message_id,v_user_id,p_reaction);
    v_enabled := true;
  end if;
  return query select true,v_enabled,(select count(*) from public.direct_message_reactions r where r.message_id=p_message_id and r.reaction=p_reaction);
end; $$;

create or replace function public.set_direct_typing_state_v2(p_conversation_id uuid,p_is_typing boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.direct_conversations c where c.id=p_conversation_id and c.status='accepted' and v_user_id in (c.participant_a,c.participant_b)) then return false; end if;
  if p_is_typing then
    insert into public.direct_typing_state (conversation_id,user_id,is_typing,updated_at,expires_at)
    values (p_conversation_id,v_user_id,true,now(),now()+interval '7 seconds')
    on conflict (conversation_id,user_id) do update set is_typing=true,updated_at=excluded.updated_at,expires_at=excluded.expires_at;
  else
    delete from public.direct_typing_state where conversation_id=p_conversation_id and user_id=v_user_id;
  end if;
  return true;
end; $$;

create or replace function public.delete_direct_message_v2(p_message_id uuid)
returns table (ok boolean, storage_paths jsonb)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_conversation_id uuid; v_paths jsonb;
begin
  select dm.conversation_id into v_conversation_id from public.direct_messages dm
  join public.direct_conversations c on c.id=dm.conversation_id
  where dm.id=p_message_id and dm.sender_id=v_user_id and dm.deleted_at is null and v_user_id in (c.participant_a,c.participant_b);
  if v_conversation_id is null then return query select false,'[]'::jsonb; return; end if;
  select coalesce(jsonb_agg(a.storage_path),'[]'::jsonb) into v_paths from public.direct_message_attachments a where a.message_id=p_message_id and a.uploader_id=v_user_id;
  update public.direct_messages set deleted_at=now(),deleted_by=v_user_id,body='تم حذف هذه الرسالة',metadata='{}'::jsonb where id=p_message_id;
  delete from public.direct_message_reactions where message_id=p_message_id;
  delete from public.direct_message_attachments where message_id=p_message_id;
  return query select true,v_paths;
end; $$;

revoke all on function public.send_direct_native_message(uuid,text,uuid,jsonb,jsonb) from public;
revoke all on function public.get_direct_native_messages(uuid,integer,timestamptz) from public;
revoke all on function public.mark_direct_conversation_read_v2(uuid) from public;
revoke all on function public.toggle_direct_message_reaction_v2(uuid,text) from public;
revoke all on function public.set_direct_typing_state_v2(uuid,boolean) from public;
revoke all on function public.delete_direct_message_v2(uuid) from public;
grant execute on function public.send_direct_native_message(uuid,text,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.get_direct_native_messages(uuid,integer,timestamptz) to authenticated;
grant execute on function public.mark_direct_conversation_read_v2(uuid) to authenticated;
grant execute on function public.toggle_direct_message_reaction_v2(uuid,text) to authenticated;
grant execute on function public.set_direct_typing_state_v2(uuid,boolean) to authenticated;
grant execute on function public.delete_direct_message_v2(uuid) to authenticated;

-- Expose only participant-readable changes through Supabase Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='direct_messages') then execute 'alter publication supabase_realtime add table public.direct_messages'; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='direct_message_attachments') then execute 'alter publication supabase_realtime add table public.direct_message_attachments'; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='direct_message_reactions') then execute 'alter publication supabase_realtime add table public.direct_message_reactions'; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='direct_typing_state') then execute 'alter publication supabase_realtime add table public.direct_typing_state'; end if;
  end if;
end $$;
