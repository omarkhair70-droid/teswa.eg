\set ON_ERROR_STOP on

-- Teswa Lane 4 deals runtime/RLS port for OCI rehearsal.
-- Canonical source semantics captured 2026-09-06; request identity authority only
-- changes from Supabase auth.uid() to teswa_runtime.current_user_id().
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

CREATE OR REPLACE FUNCTION public.complete_deal_if_ready(p_deal_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_deal public.swap_deals%rowtype; v_count integer;
begin
  select * into v_deal from public.swap_deals where id=p_deal_id for update;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if teswa_runtime.current_user_id() is null or teswa_runtime.current_user_id() not in (v_deal.requester_id,v_deal.offerer_id) then raise exception 'not_allowed' using errcode='42501'; end if;
  if v_deal.status in ('completed','cancelled','disputed') then return v_deal.status='completed'; end if;
  if v_deal.status not in ('coordinating','completed_pending_confirmation') then raise exception 'invalid_deal_transition' using errcode='P0001'; end if;
  select count(distinct user_id) into v_count from public.deal_confirmations where deal_id=p_deal_id and user_id in (v_deal.requester_id,v_deal.offerer_id);
  if v_count>=2 then
    update public.swap_deals set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=p_deal_id;
    return true;
  end if;
  if v_deal.status='coordinating' then update public.swap_deals set status='completed_pending_confirmation',updated_at=now() where id=p_deal_id; end if;
  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_unread_deal_messages_count()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare current_user_id uuid; unread_count integer;
begin
  current_user_id:=teswa_runtime.current_user_id();
  if current_user_id is null then return 0; end if;
  select count(*)::integer into unread_count
  from public.deal_messages dm join public.swap_deals sd on sd.id=dm.deal_id
  left join public.deal_message_reads dmr on dmr.deal_id=dm.deal_id and dmr.user_id=current_user_id
  where (sd.requester_id=current_user_id or sd.offerer_id=current_user_id)
    and dm.sender_id<>current_user_id and (dmr.last_read_at is null or dm.created_at>dmr.last_read_at);
  return coalesce(unread_count,0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_deal_thread_read(p_deal_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_user_id uuid; v_deal_exists boolean; v_is_participant boolean;
begin
  v_user_id:=teswa_runtime.current_user_id();
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select exists(select 1 from public.swap_deals d where d.id=p_deal_id) into v_deal_exists;
  if not v_deal_exists then raise exception 'Deal not found'; end if;
  select exists(select 1 from public.swap_deals d where d.id=p_deal_id and (d.requester_id=v_user_id or d.offerer_id=v_user_id)) into v_is_participant;
  if not v_is_participant then raise exception 'Not allowed'; end if;
  insert into public.deal_message_reads(deal_id,user_id,last_read_at) values(p_deal_id,v_user_id,now())
  on conflict(deal_id,user_id) do update set last_read_at=excluded.last_read_at,updated_at=now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_deal(p_deal_id uuid,p_reason text,p_details text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid:=teswa_runtime.current_user_id(); v_deal public.swap_deals%rowtype; v_reported_user_id uuid; v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_deal from public.swap_deals where id=p_deal_id;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_deal.requester_id,v_deal.offerer_id) then raise exception 'not_participant' using errcode='42501'; end if;
  v_reported_user_id:=case when v_deal.requester_id=v_uid then v_deal.offerer_id else v_deal.requester_id end;
  if v_reported_user_id is null or v_reported_user_id=v_uid then raise exception 'invalid_target' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,'')))=0 or length(trim(p_reason))>500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin v_reason:=trim(p_reason)::public.report_reason; exception when invalid_text_representation then raise exception 'invalid_reason' using errcode='P0001'; end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports(reporter_id,reported_user_id,reported_deal_id,reason,details,status)
  values(v_uid,v_reported_user_id,p_deal_id,v_reason,nullif(trim(coalesce(p_details,'')),''),'open'::public.report_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_deal_message(p_deal_id uuid,p_deal_message_id uuid,p_reason text,p_details text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid:=teswa_runtime.current_user_id(); v_deal public.swap_deals%rowtype; v_sender uuid; v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_deal from public.swap_deals where id=p_deal_id;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_deal.requester_id,v_deal.offerer_id) then raise exception 'not_participant' using errcode='42501'; end if;
  select dm.sender_id into v_sender from public.deal_messages dm where dm.id=p_deal_message_id and dm.deal_id=p_deal_id;
  if v_sender is null then raise exception 'deal_message_not_found' using errcode='P0001'; end if;
  if v_sender=v_uid then raise exception 'cannot_report_own_message' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,'')))=0 or length(trim(p_reason))>500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin v_reason:=trim(p_reason)::public.report_reason; exception when invalid_text_representation then raise exception 'invalid_reason' using errcode='P0001'; end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports(reporter_id,reported_user_id,reported_deal_id,reported_deal_message_id,reason,details,status)
  values(v_uid,v_sender,p_deal_id,p_deal_message_id,v_reason,nullif(trim(coalesce(p_details,'')),''),'open'::public.report_status);
end;
$function$;

CREATE OR REPLACE FUNCTION public.report_item(p_item_id uuid,p_reason text,p_details text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid:=teswa_runtime.current_user_id(); v_owner uuid; v_reason public.report_reason;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select i.owner_id into v_owner from public.items i where i.id=p_item_id;
  if v_owner is null then raise exception 'item_not_found' using errcode='P0001'; end if;
  if v_owner=v_uid then raise exception 'cannot_report_own_item' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,'')))=0 or length(trim(p_reason))>500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  begin v_reason:=trim(p_reason)::public.report_reason; exception when invalid_text_representation then raise exception 'invalid_reason' using errcode='P0001'; end;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports(reporter_id,reported_user_id,reported_item_id,reason,details,status)
  values(v_uid,v_owner,p_item_id,v_reason,nullif(trim(coalesce(p_details,'')),''),'open'::public.report_status);
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_deal_if_ready(uuid),public.get_unread_deal_messages_count(),public.mark_deal_thread_read(uuid),public.report_deal(uuid,text,text),public.report_deal_message(uuid,uuid,text,text),public.report_item(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_deal_if_ready(uuid),public.get_unread_deal_messages_count(),public.mark_deal_thread_read(uuid),public.report_deal(uuid,text,text),public.report_deal_message(uuid,uuid,text,text),public.report_item(uuid,text,text) TO teswa_app_authenticated;

GRANT SELECT ON public.swap_deals,public.admin_users TO teswa_app_authenticated;
GRANT SELECT,INSERT ON public.deal_messages,public.deal_confirmations,public.reviews TO teswa_app_authenticated;
GRANT SELECT,INSERT,UPDATE ON public.deal_message_reads TO teswa_app_authenticated;

ALTER TABLE public.swap_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deals_participant_select ON public.swap_deals;
CREATE POLICY deals_participant_select ON public.swap_deals FOR SELECT TO teswa_app_authenticated
USING (requester_id=teswa_runtime.current_user_id() OR offerer_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS deal_messages_participant_select ON public.deal_messages;
CREATE POLICY deal_messages_participant_select ON public.deal_messages FOR SELECT TO teswa_app_authenticated
USING (EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_messages.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS deal_messages_admin_select ON public.deal_messages;
CREATE POLICY deal_messages_admin_select ON public.deal_messages FOR SELECT TO teswa_app_authenticated
USING (EXISTS(SELECT 1 FROM public.admin_users a WHERE a.user_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS deal_messages_participant_insert ON public.deal_messages;
CREATE POLICY deal_messages_participant_insert ON public.deal_messages FOR INSERT TO teswa_app_authenticated
WITH CHECK (sender_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_messages.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id()) AND d.status=ANY(ARRAY['coordinating'::deal_status,'completed_pending_confirmation'::deal_status])));

DROP POLICY IF EXISTS deal_message_reads_self_select ON public.deal_message_reads;
CREATE POLICY deal_message_reads_self_select ON public.deal_message_reads FOR SELECT TO teswa_app_authenticated
USING (user_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_message_reads.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS deal_message_reads_self_insert ON public.deal_message_reads;
CREATE POLICY deal_message_reads_self_insert ON public.deal_message_reads FOR INSERT TO teswa_app_authenticated
WITH CHECK (user_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_message_reads.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS deal_message_reads_self_update ON public.deal_message_reads;
CREATE POLICY deal_message_reads_self_update ON public.deal_message_reads FOR UPDATE TO teswa_app_authenticated
USING (user_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_message_reads.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id())))
WITH CHECK (user_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_message_reads.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id())));

DROP POLICY IF EXISTS deal_confirmations_participant_select ON public.deal_confirmations;
CREATE POLICY deal_confirmations_participant_select ON public.deal_confirmations FOR SELECT TO teswa_app_authenticated
USING (EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_confirmations.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id())));
DROP POLICY IF EXISTS deal_confirmations_participant_insert ON public.deal_confirmations;
CREATE POLICY deal_confirmations_participant_insert ON public.deal_confirmations FOR INSERT TO teswa_app_authenticated
WITH CHECK (user_id=teswa_runtime.current_user_id() AND EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=deal_confirmations.deal_id AND (d.requester_id=teswa_runtime.current_user_id() OR d.offerer_id=teswa_runtime.current_user_id())));

DROP POLICY IF EXISTS reviews_public_select ON public.reviews;
CREATE POLICY reviews_public_select ON public.reviews FOR SELECT TO teswa_app_authenticated USING (true);
DROP POLICY IF EXISTS reviews_participant_completed_insert ON public.reviews;
CREATE POLICY reviews_participant_completed_insert ON public.reviews FOR INSERT TO teswa_app_authenticated
WITH CHECK (reviewer_id=teswa_runtime.current_user_id() AND reviewer_id<>reviewee_id AND EXISTS(SELECT 1 FROM public.swap_deals d WHERE d.id=reviews.deal_id AND d.status='completed'::deal_status AND (((d.requester_id=reviews.reviewer_id) AND (d.offerer_id=reviews.reviewee_id)) OR ((d.offerer_id=reviews.reviewer_id) AND (d.requester_id=reviews.reviewee_id)))));

COMMIT;
