\set ON_ERROR_STOP on
-- Rehearsal-only extension of the existing Marketplace editor. No source writes.
BEGIN;
CREATE OR REPLACE FUNCTION teswa_runtime.apply_owned_listing_image_plan(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor uuid := teswa_runtime.require_user_id();
  v_id uuid;
  v_status public.item_status;
  v_rows jsonb;
  v_row jsonb;
  v_existing uuid[] := ARRAY[]::uuid[];
  v_urls text[] := ARRAY[]::text[];
  v_removed text[] := ARRAY[]::text[];
  v_image_id uuid;
  v_url text;
  v_kind text;
  v_order integer := 0;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
  END IF;
  v_id := (p_payload->>'itemId')::uuid;
  IF v_id IS NULL OR (p_payload->>'ownerId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'invalid_image_plan_actor' USING ERRCODE='42501';
  END IF;
  v_rows := p_payload->'orderedRows';
  IF jsonb_typeof(v_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(v_rows) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
  END IF;
  -- Serialize edits to the same listing, including metadata edits and lifecycle changes.
  SELECT status INTO v_status FROM public.items WHERE id=v_id AND owner_id=v_actor FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_unauthorized'); END IF;
  IF v_status NOT IN ('active'::public.item_status,'archived'::public.item_status) THEN
    RETURN jsonb_build_object('code','not_editable');
  END IF;
  PERFORM 1 FROM public.item_images WHERE item_id=v_id FOR UPDATE;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    IF jsonb_typeof(v_row) <> 'object' THEN RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023'; END IF;
    v_kind := v_row->>'kind';
    v_url := v_row->>'imageUrl';
    IF jsonb_typeof(v_row->'imageUrl') <> 'string' OR v_url IS NULL
       OR v_url <> btrim(v_url) OR char_length(v_url) NOT BETWEEN 1 AND 4096
       OR v_url = ANY(v_urls) THEN
      RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
    END IF;
    v_urls := array_append(v_urls,v_url);
    IF v_kind='existing' THEN
      IF (SELECT count(*) FROM jsonb_object_keys(v_row)) <> 3
         OR NOT (v_row ?& ARRAY['kind','imageId','imageUrl'])
         OR jsonb_typeof(v_row->'imageId') <> 'string' THEN
        RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
      END IF;
      v_image_id := (v_row->>'imageId')::uuid;
      IF v_image_id IS NULL OR v_image_id = ANY(v_existing)
         OR NOT EXISTS(SELECT 1 FROM public.item_images
                       WHERE id=v_image_id AND item_id=v_id AND btrim(image_url)=v_url) THEN
        RAISE EXCEPTION 'stale_image_plan' USING ERRCODE='22023';
      END IF;
      v_existing := array_append(v_existing,v_image_id);
    ELSIF v_kind='new' THEN
      IF (SELECT count(*) FROM jsonb_object_keys(v_row)) <> 2
         OR NOT (v_row ?& ARRAY['kind','imageUrl']) THEN
        RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
    END IF;
  END LOOP;
  -- The caller receives only URLs of rows actually removed. Object cleanup is separate.
  SELECT coalesce(array_agg(btrim(image_url) ORDER BY id),ARRAY[]::text[]) INTO v_removed
  FROM public.item_images WHERE item_id=v_id AND NOT (id=ANY(v_existing))
    AND NOT (btrim(image_url)=ANY(v_urls));
  DELETE FROM public.item_images WHERE item_id=v_id AND NOT (id=ANY(v_existing));
  -- Clear the old primary before choosing the new one; retain existing row IDs.
  UPDATE public.item_images SET is_primary=false WHERE item_id=v_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_url := v_row->>'imageUrl';
    IF v_row->>'kind'='existing' THEN
      UPDATE public.item_images SET sort_order=v_order, is_primary=(v_order=0)
      WHERE id=(v_row->>'imageId')::uuid AND item_id=v_id;
    ELSE
      INSERT INTO public.item_images(item_id,image_url,is_primary,sort_order)
      VALUES(v_id,v_url,v_order=0,v_order);
    END IF;
    v_order := v_order+1;
  END LOOP;
  RETURN jsonb_build_object('code','updated','removedImageUrls',to_jsonb(v_removed));
END;
$function$;
REVOKE ALL ON FUNCTION teswa_runtime.apply_owned_listing_image_plan(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_runtime.apply_owned_listing_image_plan(jsonb) TO teswa_app_authenticated;
COMMIT;
