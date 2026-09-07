\set ON_ERROR_STOP on

-- Teswa Lane 4 final database-runtime closure for OCI rehearsal.
-- Covers the last request-identity functions, the remaining auth.uid() RLS surface,
-- and replaces legacy Supabase service_role moderation bypasses with Teswa-owned
-- privileged server functions. Rehearsal only; no production cutover.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswa_app_authenticated') THEN
    CREATE ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswa_internal_moderation') THEN
    CREATE ROLE teswa_internal_moderation NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END$$;
ALTER ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE teswa_internal_moderation NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA IF NOT EXISTS teswa_internal;
REVOKE ALL ON SCHEMA teswa_internal FROM PUBLIC;
GRANT USAGE ON SCHEMA teswa_internal TO teswa_internal_moderation;
GRANT USAGE ON SCHEMA public,teswa_runtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.current_user_id(),teswa_runtime.require_user_id() TO teswa_app_authenticated;

CREATE OR REPLACE FUNCTION public.create_story_reply_thread(p_story_id uuid,p_body text)
RETURNS TABLE(conversation_id uuid,message_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid:=teswa_runtime.current_user_id(); v_recipient_id uuid; v_conversation_id uuid; v_message_id uuid; v_body text:=btrim(coalesce(p_body,''));
begin
  if v_user_id is null then return; end if;
  if p_story_id is null or v_body='' or char_length(v_body)>800 then return; end if;
  select s.user_id into v_recipient_id from public.stories s where s.id=p_story_id and s.expires_at>now() limit 1;
  if v_recipient_id is null or v_recipient_id=v_user_id then return; end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=v_recipient_id) or (b.blocker_id=v_recipient_id and b.blocked_user_id=v_user_id)) then return; end if;
  insert into public.contextual_conversations(context_type,context_entity_id,starter_id,recipient_id)
  values('story_reply',p_story_id,v_user_id,v_recipient_id)
  on conflict(context_type,context_entity_id,starter_id) do update set updated_at=now() returning id into v_conversation_id;
  insert into public.contextual_messages(conversation_id,sender_id,body) values(v_conversation_id,v_user_id,v_body) returning id into v_message_id;
  update public.contextual_conversations set updated_at=now() where id=v_conversation_id;
  conversation_id:=v_conversation_id; message_id:=v_message_id; return next;
end;$function$;

CREATE OR REPLACE FUNCTION public.ensure_story_reply_conversation(p_story_id uuid)
RETURNS TABLE(conversation_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id(); v_recipient_id uuid; v_conversation_id uuid;
begin
  if v_user_id is null or p_story_id is null then return; end if;
  select s.user_id into v_recipient_id from public.stories s where s.id=p_story_id and s.expires_at>now() limit 1;
  if v_recipient_id is null or v_recipient_id=v_user_id then return; end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=v_recipient_id) or (b.blocker_id=v_recipient_id and b.blocked_user_id=v_user_id)) then return; end if;
  insert into public.contextual_conversations(context_type,context_entity_id,starter_id,recipient_id)
  values('story_reply',p_story_id,v_user_id,v_recipient_id)
  on conflict(context_type,context_entity_id,starter_id) do update set updated_at=now() returning id into v_conversation_id;
  update public.contextual_conversations set updated_at=now() where id=v_conversation_id;
  conversation_id:=v_conversation_id; return next;
end;$function$;

CREATE OR REPLACE FUNCTION public.get_unread_contextual_messages_count()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id(); v_count integer;
begin
  if v_user_id is null then return 0; end if;
  select count(*)::integer into v_count
  from public.contextual_messages m
  join public.contextual_conversations c on c.id=m.conversation_id
  left join public.contextual_message_reads r on r.conversation_id=c.id and r.user_id=v_user_id
  where (c.starter_id=v_user_id or c.recipient_id=v_user_id) and m.sender_id<>v_user_id and (r.last_read_at is null or m.created_at>r.last_read_at);
  return coalesce(v_count,0);
end;$function$;

CREATE OR REPLACE FUNCTION public.guard_profiles_self_update()
RETURNS trigger LANGUAGE plpgsql
AS $function$
begin
  if current_setting('app.trusted_profile_metric_update',true)='on' then return new; end if;
  if teswa_runtime.current_user_id() is not null and teswa_runtime.current_user_id()=old.id then
    if new.successful_swaps_count is distinct from old.successful_swaps_count
       or new.response_rate is distinct from old.response_rate
       or new.is_banned is distinct from old.is_banned
       or new.created_at is distinct from old.created_at
       or new.id is distinct from old.id then
      raise exception 'Protected profile fields cannot be changed by the profile owner';
    end if;
  end if;
  return new;
end;$function$;

CREATE OR REPLACE FUNCTION public.mark_contextual_thread_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid:=teswa_runtime.current_user_id();
begin
  if v_user_id is null then return; end if;
  if not exists(select 1 from public.contextual_conversations c where c.id=p_conversation_id and (c.starter_id=v_user_id or c.recipient_id=v_user_id)) then return; end if;
  insert into public.contextual_message_reads(conversation_id,user_id,last_read_at)
  values(p_conversation_id,v_user_id,now())
  on conflict(conversation_id,user_id) do update set last_read_at=excluded.last_read_at;
end;$function$;

CREATE OR REPLACE FUNCTION teswa_internal.review_report(
  p_report_id uuid,p_status text,p_action_taken text DEFAULT NULL::text,p_admin_notes text DEFAULT NULL::text,p_reviewed_by uuid DEFAULT NULL::uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $function$
declare v_rows integer;
begin
  if p_status not in ('reviewing','actioned','dismissed') then raise exception 'invalid_status' using errcode='P0001'; end if;
  if p_reviewed_by is not null and not exists(
    select 1 from public.admin_users a where a.user_id=p_reviewed_by
    union all
    select 1 from public.profiles p where p.id=p_reviewed_by and p.role in ('admin','moderator')
  ) then raise exception 'invalid_reviewed_by' using errcode='42501'; end if;
  execute 'update public.reports set status='||quote_literal(p_status)||', action_taken=nullif(trim(coalesce($2,'''')),''''), admin_notes=nullif(trim(coalesce($3,'''')),''''), reviewed_by=$4, reviewed_at=now() where id=$1'
  using p_report_id,p_action_taken,p_admin_notes,p_reviewed_by;
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception 'report_not_found' using errcode='P0001'; end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.review_report(p_report_id uuid,p_status text,p_action_taken text DEFAULT NULL::text,p_admin_notes text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','teswa_runtime','pg_catalog'
AS $function$
begin
  if not public.is_admin_user() then raise exception 'not_allowed' using errcode='42501'; end if;
  perform teswa_internal.review_report(p_report_id,p_status,p_action_taken,p_admin_notes,teswa_runtime.current_user_id());
end;$function$;

CREATE OR REPLACE FUNCTION teswa_internal.hide_item_for_moderation(p_item_id uuid,p_report_id uuid DEFAULT NULL::uuid,p_reviewed_by uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog'
AS $function$
declare v_target_status text:='archived'; v_rows integer;
begin
  if p_reviewed_by is not null and not exists(
    select 1 from public.admin_users a where a.user_id=p_reviewed_by
    union all
    select 1 from public.profiles p where p.id=p_reviewed_by and p.role in ('admin','moderator')
  ) then raise exception 'invalid_reviewed_by' using errcode='42501'; end if;
  if exists(
    select 1 from pg_attribute a join pg_class t on t.oid=a.attrelid join pg_namespace n on n.oid=t.relnamespace join pg_type typ on typ.oid=a.atttypid join pg_enum e on e.enumtypid=typ.oid
    where n.nspname='public' and t.relname='items' and a.attname='status' and e.enumlabel='hidden'
  ) or exists(
    select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='items' and pg_get_constraintdef(c.oid) ilike '%status%hidden%'
  ) then v_target_status:='hidden'; end if;
  execute 'update public.items set status='||quote_literal(v_target_status)||', updated_at=now() where id=$1 and status::text=''active''' using p_item_id;
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception 'item_not_mutable' using errcode='P0001'; end if;
  if p_report_id is not null then perform teswa_internal.review_report(p_report_id,'actioned','item_hidden','Item hidden for moderation.',p_reviewed_by); end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.hide_item_for_moderation(p_item_id uuid,p_report_id uuid DEFAULT NULL::uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','teswa_runtime','pg_catalog'
AS $function$
begin
  if not public.is_admin_user() then raise exception 'not_allowed' using errcode='42501'; end if;
  perform teswa_internal.hide_item_for_moderation(p_item_id,p_report_id,teswa_runtime.current_user_id());
end;$function$;

REVOKE ALL ON FUNCTION teswa_internal.review_report(uuid,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_internal.hide_item_for_moderation(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_internal.review_report(uuid,text,text,text,uuid),teswa_internal.hide_item_for_moderation(uuid,uuid,uuid) TO teswa_internal_moderation;
REVOKE ALL ON FUNCTION public.create_story_reply_thread(uuid,text),public.ensure_story_reply_conversation(uuid),public.get_unread_contextual_messages_count(),public.guard_profiles_self_update(),public.mark_contextual_thread_read(uuid),public.review_report(uuid,text,text,text),public.hide_item_for_moderation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_story_reply_thread(uuid,text),public.ensure_story_reply_conversation(uuid),public.get_unread_contextual_messages_count(),public.mark_contextual_thread_read(uuid),public.review_report(uuid,text,text,text),public.hide_item_for_moderation(uuid,uuid) TO teswa_app_authenticated;

GRANT SELECT ON public.contextual_conversations TO teswa_app_authenticated;
GRANT SELECT,INSERT ON public.contextual_messages TO teswa_app_authenticated;
GRANT SELECT ON public.contextual_message_reads TO teswa_app_authenticated;
GRANT INSERT ON public.account_deletion_requests TO teswa_app_authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.creator_drops,public.creator_drop_items,public.dolab_items,public.dolab_media,public.dolab_notes,public.featured_story_items TO teswa_app_authenticated;
GRANT SELECT,INSERT,UPDATE ON public.feedback,public.profiles TO teswa_app_authenticated;
GRANT SELECT,INSERT,DELETE ON public.item_likes TO teswa_app_authenticated;
GRANT SELECT,INSERT ON public.user_policy_acceptances TO teswa_app_authenticated;

ALTER TABLE public.contextual_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contextual_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contextual_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_drop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dolab_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dolab_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dolab_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_story_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_policy_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contextual_conversations_select_participants ON public.contextual_conversations;
CREATE POLICY contextual_conversations_select_participants ON public.contextual_conversations FOR SELECT TO teswa_app_authenticated USING (starter_id=teswa_runtime.current_user_id() OR recipient_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS contextual_message_reads_select_self_participant ON public.contextual_message_reads;
CREATE POLICY contextual_message_reads_select_self_participant ON public.contextual_message_reads FOR SELECT TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id() AND EXISTS(select 1 from public.contextual_conversations c where c.id=contextual_message_reads.conversation_id and (c.starter_id=teswa_runtime.current_user_id() or c.recipient_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS contextual_messages_insert_conversation_participants ON public.contextual_messages;
CREATE POLICY contextual_messages_insert_conversation_participants ON public.contextual_messages FOR INSERT TO teswa_app_authenticated WITH CHECK (sender_id=teswa_runtime.current_user_id() AND EXISTS(select 1 from public.contextual_conversations c where c.id=contextual_messages.conversation_id and (c.starter_id=teswa_runtime.current_user_id() or c.recipient_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS contextual_messages_select_conversation_participants ON public.contextual_messages;
CREATE POLICY contextual_messages_select_conversation_participants ON public.contextual_messages FOR SELECT TO teswa_app_authenticated USING (EXISTS(select 1 from public.contextual_conversations c where c.id=contextual_messages.conversation_id and (c.starter_id=teswa_runtime.current_user_id() or c.recipient_id=teswa_runtime.current_user_id())));

DROP POLICY IF EXISTS account_deletion_requests_authenticated_insert ON public.account_deletion_requests;
CREATE POLICY account_deletion_requests_authenticated_insert ON public.account_deletion_requests FOR INSERT TO teswa_app_authenticated WITH CHECK (((request_source='public_web'::text) AND user_id IS NULL) OR ((request_source='authenticated_profile'::text) AND user_id=teswa_runtime.current_user_id()));

DROP POLICY IF EXISTS creator_drops_admin_all ON public.creator_drops;
CREATE POLICY creator_drops_admin_all ON public.creator_drops FOR ALL TO teswa_app_authenticated USING (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS creator_drop_items_admin_all ON public.creator_drop_items;
CREATE POLICY creator_drop_items_admin_all ON public.creator_drop_items FOR ALL TO teswa_app_authenticated USING (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id()));

DROP POLICY IF EXISTS dolab_items_select_own ON public.dolab_items;
CREATE POLICY dolab_items_select_own ON public.dolab_items FOR SELECT TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS dolab_items_insert_own ON public.dolab_items;
CREATE POLICY dolab_items_insert_own ON public.dolab_items FOR INSERT TO teswa_app_authenticated WITH CHECK (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS dolab_items_update_own ON public.dolab_items;
CREATE POLICY dolab_items_update_own ON public.dolab_items FOR UPDATE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id()) WITH CHECK (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS dolab_items_delete_own ON public.dolab_items;
CREATE POLICY dolab_items_delete_own ON public.dolab_items FOR DELETE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS dolab_media_select_own ON public.dolab_media;
CREATE POLICY dolab_media_select_own ON public.dolab_media FOR SELECT TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS dolab_media_insert_own ON public.dolab_media;
CREATE POLICY dolab_media_insert_own ON public.dolab_media FOR INSERT TO teswa_app_authenticated WITH CHECK (user_id=teswa_runtime.current_user_id() AND (dolab_item_id IS NULL OR EXISTS(select 1 from public.dolab_items di where di.id=dolab_media.dolab_item_id and di.user_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS dolab_media_update_own ON public.dolab_media;
CREATE POLICY dolab_media_update_own ON public.dolab_media FOR UPDATE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id()) WITH CHECK (user_id=teswa_runtime.current_user_id() AND (dolab_item_id IS NULL OR EXISTS(select 1 from public.dolab_items di where di.id=dolab_media.dolab_item_id and di.user_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS dolab_media_delete_own ON public.dolab_media;
CREATE POLICY dolab_media_delete_own ON public.dolab_media FOR DELETE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS dolab_notes_select_own ON public.dolab_notes;
CREATE POLICY dolab_notes_select_own ON public.dolab_notes FOR SELECT TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS dolab_notes_insert_own ON public.dolab_notes;
CREATE POLICY dolab_notes_insert_own ON public.dolab_notes FOR INSERT TO teswa_app_authenticated WITH CHECK (user_id=teswa_runtime.current_user_id() AND (dolab_item_id IS NULL OR EXISTS(select 1 from public.dolab_items di where di.id=dolab_notes.dolab_item_id and di.user_id=teswa_runtime.current_user_id())) AND (media_id IS NULL OR EXISTS(select 1 from public.dolab_media dm where dm.id=dolab_notes.media_id and dm.user_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS dolab_notes_update_own ON public.dolab_notes;
CREATE POLICY dolab_notes_update_own ON public.dolab_notes FOR UPDATE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id()) WITH CHECK (user_id=teswa_runtime.current_user_id() AND (dolab_item_id IS NULL OR EXISTS(select 1 from public.dolab_items di where di.id=dolab_notes.dolab_item_id and di.user_id=teswa_runtime.current_user_id())) AND (media_id IS NULL OR EXISTS(select 1 from public.dolab_media dm where dm.id=dolab_notes.media_id and dm.user_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS dolab_notes_delete_own ON public.dolab_notes;
CREATE POLICY dolab_notes_delete_own ON public.dolab_notes FOR DELETE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS featured_story_items_admin_all ON public.featured_story_items;
CREATE POLICY featured_story_items_admin_all ON public.featured_story_items FOR ALL TO teswa_app_authenticated USING (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id()));

DROP POLICY IF EXISTS feedback_admin_select ON public.feedback;
CREATE POLICY feedback_admin_select ON public.feedback FOR SELECT TO teswa_app_authenticated USING (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS feedback_admin_update ON public.feedback;
CREATE POLICY feedback_admin_update ON public.feedback FOR UPDATE TO teswa_app_authenticated USING (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(select 1 from public.admin_users a where a.user_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS feedback_self_insert ON public.feedback;
CREATE POLICY feedback_self_insert ON public.feedback FOR INSERT TO teswa_app_authenticated WITH CHECK (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS feedback_self_select ON public.feedback;
CREATE POLICY feedback_self_select ON public.feedback FOR SELECT TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS item_likes_delete_own ON public.item_likes;
CREATE POLICY item_likes_delete_own ON public.item_likes FOR DELETE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS item_likes_insert_own ON public.item_likes;
CREATE POLICY item_likes_insert_own ON public.item_likes FOR INSERT TO teswa_app_authenticated WITH CHECK (user_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT TO teswa_app_authenticated WITH CHECK (id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO teswa_app_authenticated USING (id=teswa_runtime.current_user_id()) WITH CHECK (id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS "Users can insert own policy acceptances" ON public.user_policy_acceptances;
CREATE POLICY "Users can insert own policy acceptances" ON public.user_policy_acceptances FOR INSERT TO teswa_app_authenticated WITH CHECK (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS "Users can read own policy acceptances" ON public.user_policy_acceptances;
CREATE POLICY "Users can read own policy acceptances" ON public.user_policy_acceptances FOR SELECT TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());

COMMIT;
