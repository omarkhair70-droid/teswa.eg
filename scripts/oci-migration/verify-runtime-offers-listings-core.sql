\set ON_ERROR_STOP on

DO $$
DECLARE
  v_functions integer;
  v_auth_uid integer;
  v_policies integer;
  v_policy_auth_uid integer;
  v_bad_roles integer;
  v_login boolean;
  v_bypass boolean;
BEGIN
  SELECT count(*) INTO v_functions
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'accept_offer','archive_owned_listing_if_safe','delete_owned_archived_listing_if_safe',
    'enforce_offer_insert_integrity','enforce_offer_lifecycle','guard_items_owner_update',
    'mark_offer_thinking','reactivate_owned_archived_listing','redirect_offer','soft_reject_offer'
  );
  IF v_functions <> 10 THEN RAISE EXCEPTION 'expected 10 offers/listings functions, found %',v_functions; END IF;

  SELECT count(*) INTO v_auth_uid
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'accept_offer','archive_owned_listing_if_safe','delete_owned_archived_listing_if_safe',
    'enforce_offer_insert_integrity','enforce_offer_lifecycle','guard_items_owner_update',
    'mark_offer_thinking','reactivate_owned_archived_listing','redirect_offer','soft_reject_offer'
  ) AND pg_get_functiondef(p.oid) LIKE '%auth.uid()%';
  IF v_auth_uid <> 0 THEN RAISE EXCEPTION 'auth.uid remains in offers/listings functions: %',v_auth_uid; END IF;

  SELECT count(*) INTO v_policies FROM pg_policies
  WHERE schemaname='public' AND policyname IN (
    'items_public_select','items_owner_insert','items_owner_select','items_owner_update',
    'item_images_public_select','item_images_owner_all',
    'item_videos_select_active_public','item_videos_delete_own_item_authenticated','item_videos_insert_own_item_authenticated','item_videos_update_own_item_authenticated',
    'item_tags_public_select','item_tags_owner_all','offers_participant_select','offers_sender_insert','offer_events_participant_select'
  );
  IF v_policies <> 15 THEN RAISE EXCEPTION 'expected 15 offers/listings policies, found %',v_policies; END IF;

  SELECT count(*) INTO v_policy_auth_uid FROM pg_policies
  WHERE schemaname='public' AND policyname IN (
    'items_public_select','items_owner_insert','items_owner_select','items_owner_update',
    'item_images_public_select','item_images_owner_all',
    'item_videos_select_active_public','item_videos_delete_own_item_authenticated','item_videos_insert_own_item_authenticated','item_videos_update_own_item_authenticated',
    'item_tags_public_select','item_tags_owner_all','offers_participant_select','offers_sender_insert','offer_events_participant_select'
  ) AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%');
  IF v_policy_auth_uid <> 0 THEN RAISE EXCEPTION 'auth.uid remains in offers/listings policies: %',v_policy_auth_uid; END IF;

  SELECT count(*) INTO v_bad_roles FROM pg_policies
  WHERE schemaname='public' AND policyname IN (
    'items_public_select','items_owner_insert','items_owner_select','items_owner_update',
    'item_images_public_select','item_images_owner_all',
    'item_videos_select_active_public','item_videos_delete_own_item_authenticated','item_videos_insert_own_item_authenticated','item_videos_update_own_item_authenticated',
    'item_tags_public_select','item_tags_owner_all','offers_participant_select','offers_sender_insert','offer_events_participant_select'
  ) AND NOT ('teswa_app_authenticated'=ANY(roles));
  IF v_bad_roles <> 0 THEN RAISE EXCEPTION 'unexpected target roles in offers/listings policies: %',v_bad_roles; END IF;

  SELECT rolcanlogin,rolbypassrls INTO v_login,v_bypass FROM pg_roles WHERE rolname='teswa_app_authenticated';
  IF v_login OR v_bypass THEN RAISE EXCEPTION 'teswa_app_authenticated role is not hardened'; END IF;
END;
$$;

BEGIN;
DO $$
DECLARE
  v_item uuid;
  v_owner uuid;
  v_other uuid;
  v_result text;
BEGIN
  SELECT id,owner_id INTO v_item,v_owner FROM public.items WHERE owner_id IS NOT NULL ORDER BY id LIMIT 1;
  IF v_item IS NULL THEN RAISE EXCEPTION 'no item available for semantic probe'; END IF;
  SELECT id INTO v_other FROM teswa_identity.users WHERE id<>v_owner ORDER BY id LIMIT 1;
  IF v_other IS NULL THEN RAISE EXCEPTION 'no second identity user available for semantic probe'; END IF;

  PERFORM set_config('teswa.user_id',v_other::text,true);
  v_result := public.archive_owned_listing_if_safe(v_item);
  IF v_result <> 'not_found_or_unauthorized' THEN RAISE EXCEPTION 'non-owner listing probe failed: %',v_result; END IF;

  PERFORM set_config('teswa.user_id',v_owner::text,true);
  v_result := public.archive_owned_listing_if_safe(v_item);
  IF v_result = 'not_found_or_unauthorized' THEN RAISE EXCEPTION 'owner listing probe unexpectedly unauthorized'; END IF;
END;
$$;
ROLLBACK;

DO $$
BEGIN
  IF teswa_runtime.current_user_id() IS NOT NULL THEN RAISE EXCEPTION 'runtime identity leaked after rollback'; END IF;
END;
$$;

SELECT 'runtime_offers_listings_core=PASS' AS result;
