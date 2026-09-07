\set ON_ERROR_STOP on

-- Teswa Lane 4 offers/listings runtime port for OCI rehearsal.
-- Canonical production semantics captured on 2026-09-06.
-- Request identity authority only: auth.uid() -> teswa_runtime.current_user_id().
-- No Supabase mutation and no production cutover.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswa_app_authenticated') THEN
    CREATE ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;
ALTER ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public,teswa_runtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.current_user_id() TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.require_user_id() TO teswa_app_authenticated;

CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_offer public.offers%rowtype;
  v_existing_deal public.swap_deals%rowtype;
  v_deal_id uuid;
begin
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0001'; end if;
  if teswa_runtime.current_user_id() is null or teswa_runtime.current_user_id() <> v_offer.receiver_id then
    raise exception 'not_allowed' using errcode='42501';
  end if;
  if v_offer.status not in ('pending','thinking','accepted') then raise exception 'invalid_offer_transition' using errcode='P0001'; end if;
  select * into v_existing_deal from public.swap_deals where offer_id=v_offer.id order by created_at asc limit 1 for update;
  if found then
    if v_offer.status <> 'accepted' then update public.offers set status='accepted',updated_at=now() where id=v_offer.id; end if;
    return v_existing_deal.id;
  end if;
  if v_offer.status='accepted' then raise exception 'accepted_offer_missing_deal' using errcode='P0001'; end if;
  insert into public.swap_deals(offer_id,requested_item_id,offered_item_id,requester_id,offerer_id,status,accepted_at,created_at,updated_at)
  values(v_offer.id,v_offer.requested_item_id,v_offer.offered_item_id,v_offer.receiver_id,v_offer.sender_id,'coordinating',now(),now(),now())
  returning id into v_deal_id;
  update public.offers set status='accepted',updated_at=now() where id=v_offer.id;
  return v_deal_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_owned_listing_if_safe(p_item_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_status public.item_status;
begin
  select i.status into v_status from public.items i where i.id=p_item_id and i.owner_id=teswa_runtime.current_user_id();
  if v_status is null then return 'not_found_or_unauthorized'; end if;
  if v_status <> 'active'::public.item_status then return 'not_active'; end if;
  if exists(select 1 from public.offers o where (o.requested_item_id=p_item_id or o.offered_item_id=p_item_id) and o.status::text in ('pending','thinking')) then return 'has_open_offers'; end if;
  update public.items set status='archived'::public.item_status where id=p_item_id and owner_id=teswa_runtime.current_user_id();
  return 'archived';
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_owned_archived_listing_if_safe(p_item_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_status public.item_status;
begin
  select i.status into v_status from public.items i where i.id=p_item_id and i.owner_id=teswa_runtime.current_user_id();
  if v_status is null then return 'not_found_or_unauthorized'; end if;
  if v_status <> 'archived'::public.item_status then return 'not_archived'; end if;
  if exists(select 1 from public.offers o where (o.requested_item_id=p_item_id or o.offered_item_id=p_item_id) and o.status::text in ('pending','thinking')) then return 'has_open_offers'; end if;
  if exists(select 1 from public.swap_deals sd where sd.requested_item_id=p_item_id or sd.offered_item_id=p_item_id) then return 'has_deal_history'; end if;
  delete from public.items where id=p_item_id and owner_id=teswa_runtime.current_user_id();
  return 'deleted';
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_offer_insert_integrity()
RETURNS trigger LANGUAGE plpgsql
AS $function$
declare
  v_requested_item public.items%rowtype;
  v_offered_item public.items%rowtype;
  v_parent_offer public.offers%rowtype;
begin
  if teswa_runtime.current_user_id() is null then raise exception 'Authentication required'; end if;
  if new.sender_id <> teswa_runtime.current_user_id() then raise exception 'sender_id must equal teswa_runtime.current_user_id()'; end if;
  if new.sender_id=new.receiver_id then raise exception 'sender and receiver must be different users'; end if;
  if new.requested_item_id=new.offered_item_id then raise exception 'requested_item_id and offered_item_id must differ'; end if;
  select * into v_requested_item from public.items where id=new.requested_item_id;
  if not found then raise exception 'Requested item not found'; end if;
  if v_requested_item.status <> 'active' then raise exception 'Requested item must be active'; end if;
  if v_requested_item.owner_id <> new.receiver_id then raise exception 'Requested item owner must match receiver'; end if;
  select * into v_offered_item from public.items where id=new.offered_item_id;
  if not found then raise exception 'Offered item not found'; end if;
  if v_offered_item.status <> 'active' then raise exception 'Offered item must be active'; end if;
  if v_offered_item.owner_id <> new.sender_id then raise exception 'Offered item owner must match sender'; end if;
  if new.parent_offer_id is not null then
    select * into v_parent_offer from public.offers where id=new.parent_offer_id;
    if not found then raise exception 'Parent offer not found'; end if;
    if v_parent_offer.status <> 'redirected' then raise exception 'Parent offer must be redirected'; end if;
    if new.status <> 'pending' then raise exception 'Follow-up offer must start pending'; end if;
    if new.sender_id <> v_parent_offer.sender_id then raise exception 'Follow-up sender mismatch'; end if;
    if new.receiver_id <> v_parent_offer.receiver_id then raise exception 'Follow-up receiver mismatch'; end if;
    if new.requested_item_id <> v_parent_offer.requested_item_id then raise exception 'Follow-up requested item mismatch'; end if;
    if new.offered_item_id = v_parent_offer.offered_item_id then raise exception 'Follow-up offered item must differ'; end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_offer_lifecycle()
RETURNS trigger LANGUAGE plpgsql
AS $function$
begin
  if new.requested_item_id is distinct from old.requested_item_id or new.offered_item_id is distinct from old.offered_item_id or new.sender_id is distinct from old.sender_id or new.receiver_id is distinct from old.receiver_id or new.parent_offer_id is distinct from old.parent_offer_id then raise exception 'Offer identity fields are immutable'; end if;
  if new.status=old.status then
    if new.message is distinct from old.message or new.public_note is distinct from old.public_note or new.redirect_type is distinct from old.redirect_type or new.responded_at is distinct from old.responded_at then raise exception 'Arbitrary same-status offer field mutation is not allowed'; end if;
    return new;
  end if;
  if old.status in ('soft_rejected','redirected','withdrawn','expired','cancelled_after_accept') then raise exception 'Offer is in terminal status'; end if;
  if old.status='accepted' then
    if new.status='cancelled_after_accept' and teswa_runtime.current_user_id() in (old.sender_id,old.receiver_id) then return new; end if;
    raise exception 'Accepted offers can only move to cancelled_after_accept';
  end if;
  if old.status='pending' and new.status='thinking' then if teswa_runtime.current_user_id() <> old.receiver_id then raise exception 'Only receiver can mark thinking'; end if; return new; end if;
  if old.status in ('pending','thinking') and new.status in ('accepted','soft_rejected','redirected') then if teswa_runtime.current_user_id() <> old.receiver_id then raise exception 'Only receiver can respond'; end if; return new; end if;
  if old.status in ('pending','thinking') and new.status='withdrawn' then if teswa_runtime.current_user_id() <> old.sender_id then raise exception 'Only sender can withdraw'; end if; return new; end if;
  raise exception 'Invalid offer status transition % -> %',old.status,new.status;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_items_owner_update()
RETURNS trigger LANGUAGE plpgsql
AS $function$
declare
  v_actor uuid := teswa_runtime.current_user_id();
  v_is_owner boolean := (v_actor is not null and old.owner_id=v_actor);
begin
  if current_setting('app.trusted_item_lifecycle_update',true)='on' then return new; end if;
  if v_is_owner then
    if new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at or new.source is distinct from old.source or new.created_from_offer_id is distinct from old.created_from_offer_id or new.view_count is distinct from old.view_count or new.offer_count is distinct from old.offer_count then raise exception 'Owner cannot mutate protected item system fields'; end if;
    if new.status is distinct from old.status and new.status <> 'archived' then raise exception 'Owner can only set item status to archived directly'; end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_offer_thinking(p_offer_id uuid,p_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_offer public.offers%rowtype;
begin
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0001'; end if;
  if teswa_runtime.current_user_id() is null or teswa_runtime.current_user_id() <> v_offer.receiver_id then raise exception 'not_allowed' using errcode='42501'; end if;
  if v_offer.status not in ('pending','thinking') then raise exception 'invalid_offer_transition' using errcode='P0001'; end if;
  update public.offers set status='thinking',updated_at=now() where id=p_offer_id;
  insert into public.offer_events(offer_id,actor_id,event_type,old_status,new_status,note) values(p_offer_id,teswa_runtime.current_user_id(),'marked_thinking',v_offer.status,'thinking',nullif(trim(coalesce(p_note,'')),''));
end;
$function$;

CREATE OR REPLACE FUNCTION public.reactivate_owned_archived_listing(p_item_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_status public.item_status;
begin
  select i.status into v_status from public.items i where i.id=p_item_id and i.owner_id=teswa_runtime.current_user_id();
  if v_status is null then return 'not_found_or_unauthorized'; end if;
  if v_status <> 'archived'::public.item_status then return 'not_archived'; end if;
  update public.items set status='active'::public.item_status where id=p_item_id and owner_id=teswa_runtime.current_user_id();
  return 'reactivated';
end;
$function$;

CREATE OR REPLACE FUNCTION public.redirect_offer(p_offer_id uuid,p_redirect_type offer_redirect_type,p_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := teswa_runtime.current_user_id();
  v_offer public.offers%rowtype;
  v_note text := nullif(btrim(p_note),'');
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_offer.receiver_id <> v_user_id then raise exception 'Only receiver can redirect'; end if;
  if v_offer.status not in ('pending','thinking') then raise exception 'Offer not respondable'; end if;
  update public.offers set status='redirected',responded_at=now(),redirect_type=p_redirect_type,public_note=v_note where id=p_offer_id;
  insert into public.offer_events(offer_id,actor_id,event_type,old_status,new_status,note) values(p_offer_id,v_user_id,'redirected',v_offer.status,'redirected',v_note);
end;
$function$;

CREATE OR REPLACE FUNCTION public.soft_reject_offer(p_offer_id uuid,p_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_offer public.offers%rowtype;
begin
  select * into v_offer from public.offers where id=p_offer_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0001'; end if;
  if teswa_runtime.current_user_id() is null or teswa_runtime.current_user_id() <> v_offer.receiver_id then raise exception 'not_allowed' using errcode='42501'; end if;
  if v_offer.status not in ('pending','thinking') then raise exception 'invalid_offer_transition' using errcode='P0001'; end if;
  update public.offers set status='soft_rejected',updated_at=now() where id=p_offer_id;
  insert into public.offer_events(offer_id,actor_id,event_type,old_status,new_status,note) values(p_offer_id,teswa_runtime.current_user_id(),'soft_rejected',v_offer.status,'soft_rejected',nullif(trim(coalesce(p_note,'')),''));
end;
$function$;

REVOKE ALL ON FUNCTION public.accept_offer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_owned_listing_if_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_owned_archived_listing_if_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_offer_insert_integrity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_offer_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_items_owner_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_offer_thinking(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reactivate_owned_archived_listing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redirect_offer(uuid,offer_redirect_type,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_reject_offer(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_offer(uuid),public.archive_owned_listing_if_safe(uuid),public.delete_owned_archived_listing_if_safe(uuid),public.mark_offer_thinking(uuid,text),public.reactivate_owned_archived_listing(uuid),public.redirect_offer(uuid,offer_redirect_type,text),public.soft_reject_offer(uuid,text) TO teswa_app_authenticated;

GRANT SELECT,INSERT,UPDATE ON public.items TO teswa_app_authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.item_images,public.item_videos,public.item_wanted_tags TO teswa_app_authenticated;
GRANT SELECT,INSERT ON public.offers TO teswa_app_authenticated;
GRANT SELECT ON public.offer_events TO teswa_app_authenticated;

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_wanted_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS items_public_select ON public.items;
CREATE POLICY items_public_select ON public.items FOR SELECT TO teswa_app_authenticated USING (status = ANY (ARRAY['active'::item_status,'reserved'::item_status,'swapped'::item_status]));
DROP POLICY IF EXISTS items_owner_insert ON public.items;
CREATE POLICY items_owner_insert ON public.items FOR INSERT TO teswa_app_authenticated WITH CHECK (owner_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS items_owner_select ON public.items;
CREATE POLICY items_owner_select ON public.items FOR SELECT TO teswa_app_authenticated USING (owner_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS items_owner_update ON public.items;
CREATE POLICY items_owner_update ON public.items FOR UPDATE TO teswa_app_authenticated USING (owner_id=teswa_runtime.current_user_id()) WITH CHECK (owner_id=teswa_runtime.current_user_id());

DROP POLICY IF EXISTS item_images_public_select ON public.item_images;
CREATE POLICY item_images_public_select ON public.item_images FOR SELECT TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_images.item_id AND i.status=ANY(ARRAY['active'::item_status,'reserved'::item_status,'swapped'::item_status])));
DROP POLICY IF EXISTS item_images_owner_all ON public.item_images;
CREATE POLICY item_images_owner_all ON public.item_images FOR ALL TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_images.item_id AND i.owner_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_images.item_id AND i.owner_id=teswa_runtime.current_user_id()));

DROP POLICY IF EXISTS item_videos_select_active_public ON public.item_videos;
CREATE POLICY item_videos_select_active_public ON public.item_videos FOR SELECT TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.items i LEFT JOIN public.profiles p ON p.id=i.owner_id WHERE i.id=item_videos.item_id AND i.status='active'::item_status AND COALESCE(p.is_banned,false)=false));
DROP POLICY IF EXISTS item_videos_delete_own_item_authenticated ON public.item_videos;
CREATE POLICY item_videos_delete_own_item_authenticated ON public.item_videos FOR DELETE TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_videos.item_id AND i.owner_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS item_videos_insert_own_item_authenticated ON public.item_videos;
CREATE POLICY item_videos_insert_own_item_authenticated ON public.item_videos FOR INSERT TO teswa_app_authenticated WITH CHECK (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_videos.item_id AND i.owner_id=teswa_runtime.current_user_id()));
DROP POLICY IF EXISTS item_videos_update_own_item_authenticated ON public.item_videos;
CREATE POLICY item_videos_update_own_item_authenticated ON public.item_videos FOR UPDATE TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_videos.item_id AND i.owner_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_videos.item_id AND i.owner_id=teswa_runtime.current_user_id()));

DROP POLICY IF EXISTS item_tags_public_select ON public.item_wanted_tags;
CREATE POLICY item_tags_public_select ON public.item_wanted_tags FOR SELECT TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_wanted_tags.item_id AND i.status=ANY(ARRAY['active'::item_status,'reserved'::item_status,'swapped'::item_status])));
DROP POLICY IF EXISTS item_tags_owner_all ON public.item_wanted_tags;
CREATE POLICY item_tags_owner_all ON public.item_wanted_tags FOR ALL TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_wanted_tags.item_id AND i.owner_id=teswa_runtime.current_user_id())) WITH CHECK (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_wanted_tags.item_id AND i.owner_id=teswa_runtime.current_user_id()));

DROP POLICY IF EXISTS offers_participant_select ON public.offers;
CREATE POLICY offers_participant_select ON public.offers FOR SELECT TO teswa_app_authenticated USING (sender_id=teswa_runtime.current_user_id() OR receiver_id=teswa_runtime.current_user_id());
DROP POLICY IF EXISTS offers_sender_insert ON public.offers;
CREATE POLICY offers_sender_insert ON public.offers FOR INSERT TO teswa_app_authenticated WITH CHECK (
  sender_id=teswa_runtime.current_user_id() AND status::text='pending' AND requested_item_id<>offered_item_id
  AND EXISTS(SELECT 1 FROM public.items requested WHERE requested.id=offers.requested_item_id AND requested.owner_id=offers.receiver_id AND requested.owner_id<>teswa_runtime.current_user_id() AND requested.status::text='active')
  AND EXISTS(SELECT 1 FROM public.items offered WHERE offered.id=offers.offered_item_id AND offered.owner_id=teswa_runtime.current_user_id() AND offered.status::text='active')
  AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=teswa_runtime.current_user_id() AND b.blocked_user_id=offers.receiver_id) OR (b.blocker_id=offers.receiver_id AND b.blocked_user_id=teswa_runtime.current_user_id()))
);
DROP POLICY IF EXISTS offer_events_participant_select ON public.offer_events;
CREATE POLICY offer_events_participant_select ON public.offer_events FOR SELECT TO teswa_app_authenticated USING (EXISTS(SELECT 1 FROM public.offers o WHERE o.id=offer_events.offer_id AND (teswa_runtime.current_user_id()=o.sender_id OR teswa_runtime.current_user_id()=o.receiver_id)));

COMMIT;
