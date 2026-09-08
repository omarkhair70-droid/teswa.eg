\set ON_ERROR_STOP on
-- Rehearsal runtime addition. No source mutation or production cutover.
-- The existing authenticated role, RLS policies and ownership guard remain authoritative.
BEGIN;
CREATE OR REPLACE FUNCTION teswa_runtime.update_owned_listing_core(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor uuid := teswa_runtime.require_user_id();
  v_id uuid;
  v_item public.items%rowtype;
  v_edit public.items%rowtype;
  v_tags text[];
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_listing_payload' USING ERRCODE='22023';
  END IF;
  v_id := (p_payload->>'itemId')::uuid;
  IF v_id IS NULL OR (p_payload->>'ownerId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'invalid_listing_actor' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_payload->'wantedTags') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload->'wantedTags') > 12 THEN
    RAISE EXCEPTION 'invalid_listing_tags' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'wantedTags') AS t(value)
             WHERE jsonb_typeof(t.value) <> 'string') THEN
    RAISE EXCEPTION 'invalid_listing_tags' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(DISTINCT btrim(t.value)) INTO v_tags
  FROM jsonb_array_elements_text(p_payload->'wantedTags') AS t(value);
  IF EXISTS (SELECT 1 FROM unnest(coalesce(v_tags,ARRAY[]::text[])) AS t(value)
             WHERE char_length(t.value) NOT BETWEEN 1 AND 50) THEN
    RAISE EXCEPTION 'invalid_listing_tags' USING ERRCODE='22023';
  END IF;
  v_edit := jsonb_populate_record(NULL::public.items,jsonb_build_object(
    'title',p_payload->'title','category_id',p_payload->'categoryId',
    'city',p_payload->'city','area',p_payload->'area',
    'condition',p_payload->'condition','condition_notes',p_payload->'conditionNotes',
    'description',p_payload->'description','item_story',p_payload->'itemStory',
    'swap_reason',p_payload->'swapReason','good_for',p_payload->'goodFor',
    'desire_mode',p_payload->'desireMode','desire_text',p_payload->'desireText'));
  IF v_edit.title IS NULL OR btrim(v_edit.title)='' THEN
    RAISE EXCEPTION 'invalid_listing_title' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_item FROM public.items
  WHERE id=v_id AND owner_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found_or_unauthorized'; END IF;
  IF v_item.status NOT IN ('active'::public.item_status,'archived'::public.item_status) THEN
    RETURN 'not_editable';
  END IF;
  UPDATE public.items SET
    title=v_edit.title,category_id=v_edit.category_id,city=v_edit.city,area=v_edit.area,
    condition=v_edit.condition,condition_notes=v_edit.condition_notes,
    description=v_edit.description,item_story=v_edit.item_story,swap_reason=v_edit.swap_reason,
    good_for=v_edit.good_for,desire_mode=v_edit.desire_mode,desire_text=v_edit.desire_text,
    location_latitude=CASE WHEN v_edit.city IS DISTINCT FROM v_item.city
      OR v_edit.area IS DISTINCT FROM v_item.area THEN NULL ELSE v_item.location_latitude END,
    location_longitude=CASE WHEN v_edit.city IS DISTINCT FROM v_item.city
      OR v_edit.area IS DISTINCT FROM v_item.area THEN NULL ELSE v_item.location_longitude END,
    updated_at=now()
  WHERE id=v_id AND owner_id=v_actor;
  DELETE FROM public.item_wanted_tags WHERE item_id=v_id;
  INSERT INTO public.item_wanted_tags(item_id,tag)
  SELECT v_id,t.value FROM unnest(coalesce(v_tags,ARRAY[]::text[])) AS t(value);
  RETURN 'updated';
END;
$function$;
REVOKE ALL ON FUNCTION teswa_runtime.update_owned_listing_core(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_runtime.update_owned_listing_core(jsonb) TO teswa_app_authenticated;
COMMIT;
