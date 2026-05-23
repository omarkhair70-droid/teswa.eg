alter table public.direct_messages
  add column if not exists message_type text not null default 'text' check (message_type in ('text','voice')),
  add column if not exists audio_storage_path text null,
  add column if not exists audio_duration_ms integer null,
  add column if not exists audio_mime_type text null,
  add column if not exists audio_size_bytes bigint null;

create index if not exists direct_messages_type_idx on public.direct_messages (message_type);

create or replace function public.get_direct_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  message_type text,
  audio_storage_path text,
  audio_duration_ms integer,
  audio_mime_type text,
  audio_size_bytes bigint,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_other uuid;
begin
  if not exists (select 1 from public.direct_conversations c where c.id=p_conversation_id and v_user_id in (c.participant_a,c.participant_b)) then return; end if;
  select case when participant_a=v_user_id then participant_b else participant_a end into v_other from public.direct_conversations where id=p_conversation_id;
  update public.direct_messages set read_at=now() where conversation_id=p_conversation_id and sender_id=v_other and read_at is null;
  return query select m.id,m.sender_id,m.body,m.message_type,m.audio_storage_path,m.audio_duration_ms,m.audio_mime_type,m.audio_size_bytes,m.created_at,m.read_at from public.direct_messages m where m.conversation_id=p_conversation_id order by m.created_at asc;
end; $$;

drop function if exists public.send_direct_voice_message(uuid,text,text,integer,text,bigint);
create or replace function public.send_direct_voice_message(
  p_conversation_id uuid,
  p_audio_storage_path text,
  p_audio_mime_type text default 'audio/m4a',
  p_audio_duration_ms integer default null,
  p_body text default 'رسالة صوتية',
  p_audio_size_bytes bigint default null
)
returns table (ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid(); v_convo public.direct_conversations%rowtype; v_mid uuid; v_created timestamptz;
begin
  if v_user_id is null then return query select false,'تسجيل الدخول مطلوب.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if p_conversation_id is null then return query select false,'تعذر تحديد المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if coalesce(btrim(p_audio_storage_path),'') = '' then return query select false,'تعذر قراءة الملف الصوتي.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if p_audio_duration_ms is not null and (p_audio_duration_ms < 500 or p_audio_duration_ms > 120000) then return query select false,'مدة الرسالة الصوتية غير صالحة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) then return query select false,'غير مسموح لك بهذه المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b) or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)) then return query select false,'لا يمكن إرسال الرسائل حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_convo.status in ('blocked', 'ignored') then return query select false,'المحادثة غير متاحة حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_convo.status='requested' and v_user_id = v_convo.requested_by and exists (select 1 from public.direct_messages dm where dm.conversation_id=v_convo.id and dm.sender_id=v_user_id) then return query select false,'طلب المراسلة اتبعت. هتكملوا الكلام لما الطلب يتقبل.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_convo.status='requested' and v_user_id <> v_convo.requested_by then return query select false,'اقبل طلب المراسلة الأول.',null::uuid,null::uuid,null::timestamptz; return; end if;

  insert into public.direct_messages (conversation_id,sender_id,body,message_type,audio_storage_path,audio_duration_ms,audio_mime_type,audio_size_bytes)
  values (v_convo.id,v_user_id,coalesce(nullif(btrim(p_body),''),'رسالة صوتية'),'voice',p_audio_storage_path,p_audio_duration_ms,coalesce(nullif(p_audio_mime_type,''),'audio/m4a'),p_audio_size_bytes)
  returning id,created_at into v_mid,v_created;

  update public.direct_conversations set last_message_at=v_created, updated_at=now() where id=v_convo.id;
  return query select true,'تم إرسال الرسالة.',v_mid,v_convo.id,v_created;
end; $$;

revoke all on function public.send_direct_voice_message(uuid,text,text,integer,text,bigint) from public;
grant execute on function public.send_direct_voice_message(uuid,text,text,integer,text,bigint) to authenticated;
