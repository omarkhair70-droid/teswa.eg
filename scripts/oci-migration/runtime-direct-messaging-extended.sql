-- Teswa Lane 4 direct messaging extended RPC port.
-- Canonical definitions captured from live Supabase on 2026-09-06.
-- Rehearsal target did not contain these nine functions, so install them explicitly.
-- Only identity authority changes: auth.uid() -> teswa_runtime.current_user_id().
-- Rehearsal target only; no production cutover.

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('teswa_runtime.current_user_id()') IS NULL THEN
    RAISE EXCEPTION 'teswa runtime identity context missing';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_direct_message_request(p_conversation_id uuid)
RETURNS TABLE(ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_user_id uuid := teswa_runtime.current_user_id(); v_convo public.direct_conversations%rowtype;
begin
  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.'; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) or v_user_id = v_convo.requested_by then return query select false,'غير مسموح.'; return; end if;
  if v_convo.status <> 'requested' then return query select false,'حالة الطلب غير قابلة للقبول الآن.'; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b) or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)) then
    return query select false,'لا يمكن تحديث الطلب حالياً.'; return;
  end if;
  update public.direct_conversations set status='accepted', accepted_at=coalesce(accepted_at,now()), updated_at=now() where id=v_convo.id and status='requested';
  if found then return query select true,'تم قبول طلب المراسلة.'; else return query select false,'تعذر تحديث حالة الطلب.'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_direct_message_v2(p_message_id uuid)
RETURNS TABLE(ok boolean, storage_paths jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id(); v_conversation_id uuid; v_paths jsonb;
begin
  select dm.conversation_id into v_conversation_id
  from public.direct_messages dm
  join public.direct_conversations c on c.id=dm.conversation_id
  where dm.id=p_message_id and dm.sender_id=v_user_id and dm.deleted_at is null and v_user_id in (c.participant_a,c.participant_b);
  if v_conversation_id is null then return query select false,'[]'::jsonb; return; end if;

  select coalesce(jsonb_agg(a.storage_path),'[]'::jsonb) into v_paths
  from public.direct_message_attachments a where a.message_id=p_message_id and a.uploader_id=v_user_id;

  update public.direct_messages set deleted_at=now(),deleted_by=v_user_id,body='تم حذف هذه الرسالة',metadata='{}'::jsonb where id=p_message_id;
  delete from public.direct_message_reactions where message_id=p_message_id;
  delete from public.direct_message_attachments where message_id=p_message_id;
  return query select true,v_paths;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_direct_conversation_messages(p_conversation_id uuid)
RETURNS TABLE(id uuid, sender_id uuid, body text, message_type text, audio_storage_path text, audio_duration_ms integer, audio_mime_type text, audio_size_bytes bigint, created_at timestamp with time zone, read_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_other uuid;
begin
  if not exists (
    select 1
    from public.direct_conversations c
    where c.id = p_conversation_id
      and v_user_id in (c.participant_a, c.participant_b)
  ) then
    return;
  end if;

  select
    case
      when c.participant_a = v_user_id then c.participant_b
      else c.participant_a
    end
  into v_other
  from public.direct_conversations c
  where c.id = p_conversation_id;

  update public.direct_messages dm
  set read_at = now()
  where dm.conversation_id = p_conversation_id
    and dm.sender_id = v_other
    and dm.read_at is null;

  return query
  select
    dm.id,
    dm.sender_id,
    dm.body,
    coalesce(dm.message_type, 'text') as message_type,
    dm.audio_storage_path,
    dm.audio_duration_ms,
    dm.audio_mime_type,
    dm.audio_size_bytes,
    dm.created_at,
    dm.read_at
  from public.direct_messages dm
  where dm.conversation_id = p_conversation_id
  order by dm.created_at asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ignore_direct_message_request(p_conversation_id uuid)
RETURNS TABLE(ok boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_user_id uuid := teswa_runtime.current_user_id(); v_convo public.direct_conversations%rowtype;
begin
  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.'; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) or v_user_id = v_convo.requested_by then return query select false,'غير مسموح.'; return; end if;
  if v_convo.status <> 'requested' then return query select false,'حالة الطلب غير قابلة للتجاهل الآن.'; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_convo.participant_a and b.blocked_user_id=v_convo.participant_b) or (b.blocker_id=v_convo.participant_b and b.blocked_user_id=v_convo.participant_a)) then
    return query select false,'لا يمكن تحديث الطلب حالياً.'; return;
  end if;
  update public.direct_conversations set status='ignored', updated_at=now() where id=v_convo.id and status='requested';
  if found then return query select true,'تم تجاهل الطلب.'; else return query select false,'تعذر تحديث حالة الطلب.'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_direct_conversation_read_v2(p_conversation_id uuid)
RETURNS TABLE(ok boolean, read_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_other uuid;
  v_now timestamptz := now();
begin
  select case when c.participant_a = v_user_id then c.participant_b else c.participant_a end
  into v_other
  from public.direct_conversations c
  where c.id = p_conversation_id
    and v_user_id in (c.participant_a, c.participant_b);

  if v_other is null then
    return query select false, null::timestamptz;
    return;
  end if;

  update public.direct_messages as dm
  set read_at = coalesce(dm.read_at, v_now)
  where dm.conversation_id = p_conversation_id
    and dm.sender_id = v_other
    and dm.read_at is null;

  return query select true, v_now;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_direct_message(p_conversation_id uuid, p_body text)
RETURNS TABLE(ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_convo public.direct_conversations%rowtype;
  v_text text := btrim(coalesce(p_body,''));
  v_mid uuid;
  v_created timestamptz;
begin
  if v_user_id is null then return query select false,'تسجيل الدخول مطلوب.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if p_conversation_id is null then return query select false,'تعذر تحديد المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if char_length(v_text)=0 or char_length(v_text)>1200 then return query select false,'الرسالة يجب أن تكون بين 1 و1200 حرف.',null::uuid,null::uuid,null::timestamptz; return; end if;

  select * into v_convo from public.direct_conversations where id = p_conversation_id;
  if not found then return query select false,'المحادثة غير موجودة.',null::uuid,null::uuid,null::timestamptz; return; end if;
  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) then return query select false,'غير مسموح لك بهذه المحادثة.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_convo.participant_a and b.blocked_user_id = v_convo.participant_b)
       or (b.blocker_id = v_convo.participant_b and b.blocked_user_id = v_convo.participant_a)
  ) then
    return query select false,'لا يمكن إرسال الرسائل حالياً.',null::uuid,null::uuid,null::timestamptz; return;
  end if;

  if v_convo.status in ('blocked', 'ignored') then return query select false,'المحادثة غير متاحة حالياً.',null::uuid,null::uuid,null::timestamptz; return; end if;

  if v_convo.status = 'requested' and v_user_id = v_convo.requested_by then
    if exists (
      select 1 from public.direct_messages dm
      where dm.conversation_id = v_convo.id and dm.sender_id = v_user_id
    ) then
      return query select false,'طلب المراسلة اتبعت. هتكملوا الكلام لما الطلب يتقبل.',null::uuid,null::uuid,null::timestamptz; return;
    end if;
  end if;

  if v_convo.status = 'requested' and v_user_id <> v_convo.requested_by then
    return query select false,'اقبل طلب المراسلة الأول.',null::uuid,null::uuid,null::timestamptz; return;
  end if;

  insert into public.direct_messages as dm (conversation_id, sender_id, body)
  values (v_convo.id, v_user_id, v_text)
  returning dm.id, dm.created_at into v_mid, v_created;

  update public.direct_conversations
  set last_message_at = v_created, updated_at = now()
  where id = v_convo.id;

  return query select true,'تم إرسال الرسالة.',v_mid,v_convo.id,v_created;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_direct_voice_message(
  p_conversation_id uuid,
  p_audio_storage_path text,
  p_audio_mime_type text DEFAULT 'audio/m4a'::text,
  p_audio_duration_ms integer DEFAULT NULL::integer,
  p_body text DEFAULT 'رسالة صوتية'::text,
  p_audio_size_bytes bigint DEFAULT NULL::bigint
)
RETURNS TABLE(ok boolean, message text, message_id uuid, conversation_id uuid, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_convo public.direct_conversations%rowtype;
  v_mid uuid;
  v_created timestamptz;
begin
  if v_user_id is null then
    return query select false, 'تسجيل الدخول مطلوب.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if p_conversation_id is null then
    return query select false, 'تعذر تحديد المحادثة.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if coalesce(btrim(p_audio_storage_path), '') = '' then
    return query select false, 'تعذر قراءة الملف الصوتي.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if p_audio_duration_ms is not null and (p_audio_duration_ms < 500 or p_audio_duration_ms > 120000) then
    return query select false, 'مدة الرسالة الصوتية غير صالحة.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select * into v_convo
  from public.direct_conversations c
  where c.id = p_conversation_id;

  if not found then
    return query select false, 'المحادثة غير موجودة.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_user_id not in (v_convo.participant_a, v_convo.participant_b) then
    return query select false, 'غير مسموح لك بهذه المحادثة.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_convo.participant_a and b.blocked_user_id = v_convo.participant_b)
       or (b.blocker_id = v_convo.participant_b and b.blocked_user_id = v_convo.participant_a)
  ) then
    return query select false, 'لا يمكن إرسال الرسائل حالياً.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_convo.status in ('blocked', 'ignored') then
    return query select false, 'المحادثة غير متاحة حالياً.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_convo.status = 'requested'
     and v_user_id = v_convo.requested_by
     and exists (
       select 1 from public.direct_messages dm
       where dm.conversation_id = v_convo.id
         and dm.sender_id = v_user_id
     ) then
    return query select false, 'طلب المراسلة اتبعت. هتكملوا الكلام لما الطلب يتقبل.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_convo.status = 'requested' and v_user_id <> v_convo.requested_by then
    return query select false, 'اقبل طلب المراسلة الأول.', null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.direct_messages (
    conversation_id, sender_id, body, message_type,
    audio_storage_path, audio_duration_ms, audio_mime_type, audio_size_bytes
  ) values (
    v_convo.id, v_user_id,
    coalesce(nullif(btrim(p_body), ''), 'رسالة صوتية'),
    'voice', p_audio_storage_path, p_audio_duration_ms,
    coalesce(nullif(p_audio_mime_type, ''), 'audio/m4a'), p_audio_size_bytes
  )
  returning public.direct_messages.id, public.direct_messages.created_at
  into v_mid, v_created;

  update public.direct_conversations dc
  set last_message_at = v_created,
      updated_at = now()
  where dc.id = v_convo.id;

  return query select true, 'تم إرسال الرسالة.', v_mid, v_convo.id, v_created;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_direct_typing_state_v2(p_conversation_id uuid, p_is_typing boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id();
begin
  if not exists (
    select 1 from public.direct_conversations c
    where c.id=p_conversation_id and c.status='accepted' and v_user_id in (c.participant_a,c.participant_b)
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id=c.participant_a and b.blocked_user_id=c.participant_b)
           or (b.blocker_id=c.participant_b and b.blocked_user_id=c.participant_a)
      )
  ) then return false; end if;

  if p_is_typing then
    insert into public.direct_typing_state (conversation_id,user_id,is_typing,updated_at,expires_at)
    values (p_conversation_id,v_user_id,true,now(),now()+interval '7 seconds')
    on conflict (conversation_id,user_id) do update set is_typing=true,updated_at=excluded.updated_at,expires_at=excluded.expires_at;
  else
    delete from public.direct_typing_state where conversation_id=p_conversation_id and user_id=v_user_id;
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_direct_message_reaction_v2(p_message_id uuid, p_reaction text)
RETURNS TABLE(ok boolean, enabled boolean, reaction_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id(); v_conversation_id uuid; v_enabled boolean;
begin
  if p_reaction not in ('love','thumbs_up') then return query select false,false,0::bigint; return; end if;
  select dm.conversation_id into v_conversation_id
  from public.direct_messages dm
  join public.direct_conversations c on c.id=dm.conversation_id
  where dm.id=p_message_id and dm.deleted_at is null and c.status='accepted' and v_user_id in (c.participant_a,c.participant_b)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id=c.participant_a and b.blocked_user_id=c.participant_b)
         or (b.blocker_id=c.participant_b and b.blocked_user_id=c.participant_a)
    );
  if v_conversation_id is null then return query select false,false,0::bigint; return; end if;

  if exists (select 1 from public.direct_message_reactions r where r.message_id=p_message_id and r.user_id=v_user_id and r.reaction=p_reaction) then
    delete from public.direct_message_reactions where message_id=p_message_id and user_id=v_user_id and reaction=p_reaction;
    v_enabled:=false;
  else
    insert into public.direct_message_reactions (conversation_id,message_id,user_id,reaction) values (v_conversation_id,p_message_id,v_user_id,p_reaction);
    v_enabled:=true;
  end if;
  return query select true,v_enabled,(select count(*) from public.direct_message_reactions r where r.message_id=p_message_id and r.reaction=p_reaction);
end;
$function$;

DO $$
DECLARE
  total integer;
  remaining integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE pg_get_functiondef(p.oid) LIKE '%auth.uid()%')
  INTO total, remaining
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN (
      'accept_direct_message_request','delete_direct_message_v2','get_direct_conversation_messages',
      'ignore_direct_message_request','mark_direct_conversation_read_v2','send_direct_message',
      'send_direct_voice_message','set_direct_typing_state_v2','toggle_direct_message_reaction_v2'
    );
  IF total <> 9 THEN RAISE EXCEPTION 'expected 9 installed extended direct functions, found %', total; END IF;
  IF remaining <> 0 THEN RAISE EXCEPTION 'auth.uid remains in % installed extended direct functions', remaining; END IF;
END;
$$;

COMMIT;
