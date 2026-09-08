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
  v_final uuid[] := ARRAY[]::uuid[];
  v_urls text[] := ARRAY[]::text[];
  v_keys text[] := ARRAY[]::text[];
  v_removed text[] := ARRAY[]::text[];
  v_image_id uuid;
  v_url text;
  v_key text;
  v_kind text;
  v_order integer := 0;
  v_offset integer;
  v_count integer;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
  END IF;
  v_id := (p_payload->>'itemId')::uuid;
  IF v_id IS NULL OR (p_payload->>'ownerId')::uuid IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'invalid_image_plan_actor' USING ERRCODE='42501';
  END IF;
  v_rows := p_payload->'orderedRows';
  IF jsonb_typeof(v_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_image_plan' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(v_rows) NOT BETWEEN 1 AND 8 THEN
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
    v_key := nullif(split_part(v_url,'#teswa-object=item_image:',2),'');
    IF v_key IS NOT NULL THEN
      IF v_key=ANY(v_keys) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
      v_keys := array_append(v_keys,v_key);
    END IF;
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
        RETURN jsonb_build_object('code','invalid_input');
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
  -- Collect removed metadata before deleting it. No object is deleted here.
  SELECT coalesce(array_agg(DISTINCT btrim(image_url) ORDER BY btrim(image_url)),ARRAY[]::text[]) INTO v_removed
  FROM public.item_images WHERE item_id=v_id AND NOT (id=ANY(v_existing));
  DELETE FROM public.item_images WHERE item_id=v_id AND NOT (id=ANY(v_existing));
  -- Stage all retained rows outside the final order range. This also supports
  -- an immediate UNIQUE(item_id,sort_order) constraint and a unique primary.
  SELECT greatest(coalesce(max(sort_order),0),8)+8,count(*)::integer INTO v_offset,v_count
  FROM public.item_images WHERE item_id=v_id;
  UPDATE public.item_images m SET is_primary=false,sort_order=v_offset+x.rn
  FROM (SELECT id,row_number() OVER (ORDER BY id)::integer AS rn FROM public.item_images WHERE item_id=v_id) x
  WHERE m.id=x.id AND m.item_id=v_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_url := v_row->>'imageUrl';
    IF v_row->>'kind'='existing' THEN
      v_image_id := (v_row->>'imageId')::uuid;
    ELSE
      INSERT INTO public.item_images(item_id,image_url,is_primary,sort_order)
      VALUES(v_id,v_url,false,v_offset+v_count+v_order+1) RETURNING id INTO v_image_id;
    END IF;
    v_final := array_append(v_final,v_image_id);
    v_order := v_order+1;
  END LOOP;
  FOR v_order IN 1..array_length(v_final,1) LOOP
    UPDATE public.item_images SET sort_order=v_order-1,is_primary=(v_order=1)
    WHERE id=v_final[v_order] AND item_id=v_id;
  END LOOP;
  UPDATE public.items SET updated_at=now() WHERE id=v_id AND owner_id=v_actor;
  -- Never tell the client to delete an object still referenced by another
  -- listing of this owner, even if the new URL has a different OCI read token.
  SELECT coalesce(array_agg(u.url ORDER BY u.url),ARRAY[]::text[]) INTO v_removed
  FROM unnest(v_removed) AS u(url)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.item_images m JOIN public.items i ON i.id=m.item_id
    WHERE i.owner_id=v_actor AND (
      btrim(m.image_url)=u.url OR
      (nullif(split_part(u.url,'#teswa-object=item_image:',2),'') IS NOT NULL
       AND split_part(m.image_url,'#teswa-object=item_image:',2)=split_part(u.url,'#teswa-object=item_image:',2))
    )
  );
  RETURN jsonb_build_object('code','updated','removedImageUrls',to_jsonb(v_removed));
END;
$function$;
REVOKE ALL ON FUNCTION teswa_runtime.apply_owned_listing_image_plan(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_runtime.apply_owned_listing_image_plan(jsonb) TO teswa_app_authenticated;
COMMIT;
