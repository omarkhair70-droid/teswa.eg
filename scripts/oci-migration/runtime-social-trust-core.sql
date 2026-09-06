\set ON_ERROR_STOP on

-- Teswa Lane 4 social/trust/moderation user-facing runtime port.
-- Canonical source semantics captured 2026-09-06.
-- Request identity authority: auth.uid() -> teswa_runtime.current_user_id().
-- review_report is intentionally excluded because its former service_role bypass
-- needs a Teswa-owned privileged-server contract rather than a fake Supabase role.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswa_app_authenticated') THEN
    CREATE ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END$$;
ALTER ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public,teswa_runtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.current_user_id(),teswa_runtime.require_user_id() TO teswa_app_authenticated;

CREATE OR REPLACE FUNCTION public.follow_user(p_followed_user_id uuid)
RETURNS TABLE(ok boolean, code text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid := teswa_runtime.current_user_id();
begin
  if v_user_id is null then return query select false,'unauthorized','يجب تسجيل الدخول أولاً.'; return; end if;
  if p_followed_user_id is null then return query select false,'invalid_target','تعذر تحديد المستخدم المطلوب.'; return; end if;
  if v_user_id=p_followed_user_id then return query select false,'self_follow','لا يمكن متابعة نفسك.'; return; end if;
  if exists(select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=p_followed_user_id) or (b.blocker_id=p_followed_user_id and b.blocked_user_id=v_user_id)) then
    return query select false,'blocked','لا يمكن تنفيذ المتابعة بسبب إعدادات الحظر.'; return;
  end if;
  insert into public.user_follows(follower_id,followed_id) values(v_user_id,p_followed_user_id) on conflict do nothing;
  if found then
    begin
      insert into public.notifications(user_id,type,title,body,actor_user_id)
      values(p_followed_user_id,'user_followed_you','متابعة جديدة','بدأ أحد المستخدمين بمتابعتك.',v_user_id);
    exception when others then null;
    end;
    return query select true,'followed','تمت المتابعة بنجاح.'; return;
  end if;
  return query select true,'noop','أنت تتابعه بالفعل.';
end;$function$;

CREATE OR REPLACE FUNCTION public.unfollow_user(p_followed_user_id uuid)
RETURNS TABLE(ok boolean, code text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid := teswa_runtime.current_user_id();
begin
  if v_user_id is null then return query select false,'unauthorized','يجب تسجيل الدخول أولاً.'; return; end if;
  if p_followed_user_id is null then return query select false,'invalid_target','تعذر تحديد المستخدم المطلوب.'; return; end if;
  if v_user_id=p_followed_user_id then return query select false,'self_unfollow','لا يمكن تنفيذ هذا الإجراء على نفسك.'; return; end if;
  delete from public.user_follows where follower_id=v_user_id and followed_id=p_followed_user_id;
  return query select true,'unfollowed','تم إلغاء المتابعة.';
end;$function$;

CREATE OR REPLACE FUNCTION public.get_user_block_state(p_target_user_id uuid)
RETURNS TABLE(blocked_by_me boolean,blocked_me boolean,is_blocked_either_direction boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_blocked_by_me boolean := false;
  v_blocked_me boolean := false;
begin
  if v_user_id is null or p_target_user_id is null or v_user_id=p_target_user_id then
    blocked_by_me:=false; blocked_me:=false; is_blocked_either_direction:=false; return next; return;
  end if;
  select exists(select 1 from public.user_blocks b where b.blocker_id=v_user_id and b.blocked_user_id=p_target_user_id) into v_blocked_by_me;
  select exists(select 1 from public.user_blocks b where b.blocker_id=p_target_user_id and b.blocked_user_id=v_user_id) into v_blocked_me;
  blocked_by_me:=v_blocked_by_me; blocked_me:=v_blocked_me; is_blocked_either_direction:=v_blocked_by_me or v_blocked_me; return next;
end;$function$;

CREATE OR REPLACE FUNCTION public.get_user_follow_state(p_target_user_id uuid)
RETURNS TABLE(following_by_me boolean,follows_me boolean,mutual boolean,follower_count bigint,following_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_following_by_me boolean := false;
  v_follows_me boolean := false;
begin
  if p_target_user_id is null then return; end if;
  if v_user_id is not null and v_user_id<>p_target_user_id then
    select exists(select 1 from public.user_follows f where f.follower_id=v_user_id and f.followed_id=p_target_user_id) into v_following_by_me;
    select exists(select 1 from public.user_follows f where f.follower_id=p_target_user_id and f.followed_id=v_user_id) into v_follows_me;
  end if;
  return query select v_following_by_me,v_follows_me,(v_following_by_me and v_follows_me),
    (select count(*) from public.user_follows where followed_id=p_target_user_id),
    (select count(*) from public.user_follows where follower_id=p_target_user_id);
end;$function$;

CREATE OR REPLACE FUNCTION public.get_my_badges()
RETURNS TABLE(badge_key text,label_ar text,description_ar text,category text,icon_name text,priority integer,awarded_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$ select * from public.get_user_badges(teswa_runtime.current_user_id()); $function$;

CREATE OR REPLACE FUNCTION public.get_my_trust_metrics()
RETURNS TABLE(user_id uuid,successful_swaps_count integer,completed_deals_count integer,cancelled_deals_count integer,total_reviews_received integer,average_rating numeric,clear_description_count integer,good_communication_count integer,on_time_count integer,respectful_swapper_count integer,response_rate numeric,avg_response_time_minutes numeric,trust_level_key text,trust_score integer)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$ select * from public.get_user_trust_metrics(teswa_runtime.current_user_id()); $function$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name='profiles' and c.column_name='role')
  and exists(select 1 from public.profiles p where p.id=teswa_runtime.current_user_id() and p.role in ('admin','moderator'));
$function$;

CREATE OR REPLACE FUNCTION public.refresh_my_badges()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_metrics record; v_awarded text[]:=array[]::text[];
begin
  select * into v_metrics from public.get_user_trust_metrics(teswa_runtime.current_user_id()) limit 1;
  if v_metrics is null then return jsonb_build_object('awarded_badges',to_jsonb(v_awarded)); end if;
  if coalesce(v_metrics.completed_deals_count,0)>=1 or coalesce(v_metrics.successful_swaps_count,0)>=1 then
    insert into public.user_badges(user_id,badge_key,source) values(teswa_runtime.current_user_id(),'first_swap','system') on conflict(user_id,badge_key) do nothing;
    if found then v_awarded:=array_append(v_awarded,'first_swap'); end if;
  end if;
  if coalesce(v_metrics.trust_level_key,'') in ('reliable_swapper','trusted_swapper') then
    insert into public.user_badges(user_id,badge_key,source) values(teswa_runtime.current_user_id(),'reliable_swapper','system') on conflict(user_id,badge_key) do nothing;
    if found then v_awarded:=array_append(v_awarded,'reliable_swapper'); end if;
  end if;
  return jsonb_build_object('awarded_badges',to_jsonb(v_awarded));
end;$function$;

CREATE OR REPLACE FUNCTION public.report_user(p_reported_user_id uuid,p_reason text,p_details text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid:=teswa_runtime.current_user_id(); v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_reported_user_id is null or p_reported_user_id=v_uid then raise exception 'invalid_target' using errcode='P0001'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_reported_user_id) then raise exception 'user_not_found' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,'')))=0 or length(trim(p_reason))>500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin v_reason:=trim(p_reason)::public.report_reason; exception when invalid_text_representation then raise exception 'invalid_reason' using errcode='P0001'; end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports(reporter_id,reported_user_id,reason,details,status)
  values(v_uid,p_reported_user_id,v_reason,nullif(trim(coalesce(p_details,'')),''),'open'::public.report_status);
end;$function$;

CREATE OR REPLACE FUNCTION public.report_story(p_story_id uuid,p_reason text,p_details text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid:=teswa_runtime.current_user_id(); v_author_id uuid; v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select s.user_id into v_author_id from public.stories s where s.id=p_story_id;
  if v_author_id is null then raise exception 'story_not_found' using errcode='P0001'; end if;
  if v_author_id=v_uid then raise exception 'cannot_report_own_story' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,'')))=0 or length(trim(p_reason))>500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin v_reason:=trim(p_reason)::public.report_reason; exception when invalid_text_representation then raise exception 'invalid_reason' using errcode='P0001'; end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports(reporter_id,reported_user_id,story_id,reason,details,status)
  values(v_uid,v_author_id,p_story_id,v_reason,nullif(trim(coalesce(p_details,'')),''),'open'::public.report_status);
end;$function$;

CREATE OR REPLACE FUNCTION public.report_direct_message(p_conversation_id uuid,p_stream_message_id text,p_reported_user_id uuid,p_reason text,p_details text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid:=teswa_runtime.current_user_id(); v_convo public.direct_conversations%rowtype; v_other uuid; v_message_id uuid; v_sender uuid; v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_convo from public.direct_conversations where id=p_conversation_id;
  if not found then raise exception 'conversation_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_convo.participant_a,v_convo.participant_b) then raise exception 'not_participant' using errcode='42501'; end if;
  v_other:=case when v_convo.participant_a=v_uid then v_convo.participant_b else v_convo.participant_a end;
  if p_reported_user_id is distinct from v_other then raise exception 'invalid_reported_user' using errcode='P0001'; end if;
  begin v_message_id:=trim(coalesce(p_stream_message_id,''))::uuid; exception when others then raise exception 'invalid_message' using errcode='P0001'; end;
  select dm.sender_id into v_sender from public.direct_messages dm where dm.id=v_message_id and dm.conversation_id=p_conversation_id;
  if v_sender is null then raise exception 'message_not_found' using errcode='P0001'; end if;
  if v_sender=v_uid then raise exception 'cannot_report_own_message' using errcode='P0001'; end if;
  if v_sender is distinct from v_other then raise exception 'invalid_message_sender' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,'')))=0 or length(trim(p_reason))>500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin v_reason:=trim(p_reason)::public.report_reason; exception when invalid_text_representation then raise exception 'invalid_reason' using errcode='P0001'; end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports(reporter_id,reported_user_id,reported_direct_conversation_id,reported_stream_message_id,reason,details,status)
  values(v_uid,v_other,p_conversation_id,v_message_id::text,v_reason,nullif(trim(coalesce(p_details,'')),''),'open'::public.report_status);
end;$function$;

REVOKE ALL ON FUNCTION public.follow_user(uuid),public.unfollow_user(uuid),public.get_user_block_state(uuid),public.get_user_follow_state(uuid),public.get_my_badges(),public.get_my_trust_metrics(),public.is_admin_user(),public.refresh_my_badges(),public.report_user(uuid,text,text),public.report_story(uuid,text,text),public.report_direct_message(uuid,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.follow_user(uuid),public.unfollow_user(uuid),public.get_user_block_state(uuid),public.get_user_follow_state(uuid),public.get_my_badges(),public.get_my_trust_metrics(),public.is_admin_user(),public.refresh_my_badges(),public.report_user(uuid,text,text),public.report_story(uuid,text,text),public.report_direct_message(uuid,text,uuid,text,text) TO teswa_app_authenticated;

GRANT SELECT,INSERT,DELETE ON public.user_follows,public.user_blocks TO teswa_app_authenticated;
GRANT SELECT,INSERT,UPDATE ON public.reports TO teswa_app_authenticated;
GRANT SELECT,INSERT,DELETE ON public.stories,public.story_likes TO teswa_app_authenticated;
GRANT SELECT,INSERT ON public.story_views TO teswa_app_authenticated;
GRANT SELECT ON public.admin_users TO teswa_app_authenticated;

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_follows_select_authenticated ON public.user_follows;
CREATE POLICY user_follows_select_authenticated ON public.user_follows FOR SELECT TO teswa_app_authenticated USING (teswa_runtime.current_user_id() IS NOT NULL);
DROP POLICY IF EXISTS user_follows_insert_own ON public.user_follows;
CREATE POLICY user_follows_insert_own ON public.user_follows FOR INSERT TO teswa_app_authenticated WITH CHECK (follower_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS user_follows_delete_own ON public.user_follows;
CREATE POLICY user_follows_delete_own ON public.user_follows FOR DELETE TO teswa_app_authenticated USING (follower_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks FOR SELECT TO teswa_app_authenticated USING (blocker_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own ON public.user_blocks FOR INSERT TO teswa_app_authenticated WITH CHECK (blocker_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own ON public.user_blocks FOR DELETE TO teswa_app_authenticated USING (blocker_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS admin_users_self_select ON public.admin_users;
CREATE POLICY admin_users_self_select ON public.admin_users FOR SELECT TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS reports_admin_select ON public.reports;
CREATE POLICY reports_admin_select ON public.reports FOR SELECT TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS reports_admin_update ON public.reports;
CREATE POLICY reports_admin_update ON public.reports FOR UPDATE TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS reports_insert_own ON public.reports;
CREATE POLICY reports_insert_own ON public.reports FOR INSERT TO teswa_app_authenticated WITH CHECK (reporter_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS reports_select_own ON public.reports;
CREATE POLICY reports_select_own ON public.reports FOR SELECT TO teswa_app_authenticated USING (reporter_id=teswa_runtime.current_user_id() OR public.is_admin_user());
DROP POLICY IF EXISTS reports_self_insert ON public.reports;
CREATE POLICY reports_self_insert ON public.reports FOR INSERT TO teswa_app_authenticated WITH CHECK (reporter_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS reports_self_select ON public.reports;
CREATE POLICY reports_self_select ON public.reports FOR SELECT TO teswa_app_authenticated USING (reporter_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS reports_update_admin ON public.reports;
CREATE POLICY reports_update_admin ON public.reports FOR UPDATE TO teswa_app_authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS stories_select_active_authenticated ON public.stories;
CREATE POLICY stories_select_active_authenticated ON public.stories FOR SELECT TO teswa_app_authenticated USING (teswa_runtime.current_user_id() IS NOT NULL AND expires_at>now());
DROP POLICY IF EXISTS stories_insert_own_authenticated ON public.stories;
CREATE POLICY stories_insert_own_authenticated ON public.stories FOR INSERT TO teswa_app_authenticated WITH CHECK (user_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS stories_delete_own_authenticated ON public.stories;
CREATE POLICY stories_delete_own_authenticated ON public.stories FOR DELETE TO teswa_app_authenticated USING (user_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS story_likes_delete_own ON public.story_likes;
CREATE POLICY story_likes_delete_own ON public.story_likes FOR DELETE TO teswa_app_authenticated USING (liker_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS story_likes_insert_authenticated_non_owner ON public.story_likes;
CREATE POLICY story_likes_insert_authenticated_non_owner ON public.story_likes FOR INSERT TO teswa_app_authenticated WITH CHECK (liker_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.stories s WHERE s.id=story_likes.story_id AND s.expires_at>now() AND s.user_id<>teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS story_likes_select_liker_or_story_owner ON public.story_likes;
CREATE POLICY story_likes_select_liker_or_story_owner ON public.story_likes FOR SELECT TO teswa_app_authenticated USING (liker_id=teswa_runtime.current_user_id() OR EXISTS(SELECT 1 FROM public.stories s WHERE s.id=story_likes.story_id AND s.user_id=teswa_runtime.current_user_id()));

DROP POLICY IF EXISTS story_views_insert_authenticated_non_owner ON public.story_views;
CREATE POLICY story_views_insert_authenticated_non_owner ON public.story_views FOR INSERT TO teswa_app_authenticated WITH CHECK (viewer_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.stories s WHERE s.id=story_views.story_id AND s.expires_at>now() AND s.user_id<>teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS story_views_select_story_owner ON public.story_views;
CREATE POLICY story_views_select_story_owner ON public.story_views FOR SELECT TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.stories s WHERE s.id=story_views.story_id AND s.user_id=teswa_runtime.current_user_id()));

COMMIT;
