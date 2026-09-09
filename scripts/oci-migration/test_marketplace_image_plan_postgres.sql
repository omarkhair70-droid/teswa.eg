\set ON_ERROR_STOP on
-- Disposable CI database only. No Teswa rehearsal or production data.
DO $$ BEGIN IF current_database() <> 'teswa_image_plan_ci' THEN RAISE EXCEPTION 'disposable_database_required'; END IF; END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='teswa_app_authenticated') THEN CREATE ROLE teswa_app_authenticated NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='teswa_image_unauthorized') THEN CREATE ROLE teswa_image_unauthorized NOLOGIN NOBYPASSRLS; END IF;
END $$;
CREATE SCHEMA teswa_runtime;
CREATE TYPE public.item_status AS ENUM ('active','archived','reserved','swapped');
CREATE FUNCTION teswa_runtime.current_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('teswa.user_id',true),'')::uuid $$;
CREATE FUNCTION teswa_runtime.require_user_id() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v uuid := teswa_runtime.current_user_id();
BEGIN IF v IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF; RETURN v; END $$;
GRANT USAGE ON SCHEMA public,teswa_runtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.current_user_id(),teswa_runtime.require_user_id() TO teswa_app_authenticated;
CREATE TABLE public.items(id uuid PRIMARY KEY,owner_id uuid NOT NULL,status public.item_status NOT NULL,updated_at timestamptz DEFAULT now());
CREATE TABLE public.item_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES public.items(id),image_url text NOT NULL CHECK(image_url <> 'https://reject.example.test'),is_primary boolean NOT NULL DEFAULT false,sort_order integer NOT NULL CHECK(sort_order>=0),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX item_images_one_primary ON public.item_images(item_id) WHERE is_primary;
CREATE UNIQUE INDEX item_images_order ON public.item_images(item_id,sort_order);
GRANT SELECT,UPDATE ON public.items TO teswa_app_authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.item_images TO teswa_app_authenticated;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY items_owner ON public.items FOR ALL TO teswa_app_authenticated USING(owner_id=teswa_runtime.current_user_id()) WITH CHECK(owner_id=teswa_runtime.current_user_id());
CREATE POLICY images_owner ON public.item_images FOR ALL TO teswa_app_authenticated USING(EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_id AND i.owner_id=teswa_runtime.current_user_id())) WITH CHECK(EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_id AND i.owner_id=teswa_runtime.current_user_id()));
INSERT INTO public.items(id,owner_id,status) VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','active'),
('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','active'),
('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222','active'),
('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','reserved');
INSERT INTO public.item_images(id,item_id,image_url,is_primary,sort_order) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','https://old.example.test/a.jpg',true,0),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','https://old.example.test/b#teswa-object=item_image:11111111-1111-4111-8111-111111111111/shared.jpg',false,1),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333','https://old.example.test/c.jpg',false,2),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','55555555-5555-4555-8555-555555555555','https://other.example.test/p#teswa-object=item_image:11111111-1111-4111-8111-111111111111/shared.jpg',true,0);
\ir runtime-marketplace-image-plan.sql
DO $$ BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname='teswa_app_authenticated') THEN RAISE EXCEPTION 'bypass role'; END IF;
  IF has_function_privilege('teswa_image_unauthorized','teswa_runtime.apply_owned_listing_image_plan(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public execution grant'; END IF;
END $$;
-- The module above commits its DDL. Start a new transaction for the actual RLS tests.
BEGIN;
SET LOCAL ROLE teswa_app_authenticated;
SELECT set_config('teswa.user_id','11111111-1111-4111-8111-111111111111',true);
DO $test$
DECLARE
  v_item constant uuid := '33333333-3333-4333-8333-333333333333';
  v_owner constant uuid := '11111111-1111-4111-8111-111111111111';
  v_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_b_url constant text := 'https://old.example.test/b#teswa-object=item_image:11111111-1111-4111-8111-111111111111/shared.jpg';
  v_new_url constant text := 'https://objectstorage.example.test/p/new#teswa-object=item_image:11111111-1111-4111-8111-111111111111/new.jpg';
  p jsonb;
  r jsonb;
  v_new_id uuid;
BEGIN
  IF current_user <> 'teswa_app_authenticated' THEN RAISE EXCEPTION 'restricted role not active'; END IF;
  p := jsonb_build_object('itemId',v_item,'ownerId',v_owner,'orderedRows',jsonb_build_array(
    jsonb_build_object('kind','existing','imageId',v_b,'imageUrl',v_b_url),
    jsonb_build_object('kind','new','imageUrl',v_new_url)));
  r := teswa_runtime.apply_owned_listing_image_plan(p);
  IF r->>'code'<>'updated' OR jsonb_array_length(r->'removedImageUrls')<>2 THEN RAISE EXCEPTION 'image update failed'; END IF;
  SELECT id INTO v_new_id FROM public.item_images WHERE item_id=v_item AND image_url=v_new_url;
  IF v_new_id IS NULL OR (SELECT count(*) FROM public.item_images WHERE item_id=v_item)<>2
     OR NOT EXISTS(SELECT 1 FROM public.item_images WHERE id=v_b AND is_primary AND sort_order=0) THEN RAISE EXCEPTION 'image identities or order changed'; END IF;
  -- Reordering must work with immediate primary/order uniqueness constraints.
  r := teswa_runtime.apply_owned_listing_image_plan(p || jsonb_build_object('orderedRows',jsonb_build_array(
    jsonb_build_object('kind','existing','imageId',v_new_id,'imageUrl',v_new_url),
    jsonb_build_object('kind','existing','imageId',v_b,'imageUrl',v_b_url))));
  IF r->>'code'<>'updated' OR NOT EXISTS(SELECT 1 FROM public.item_images WHERE id=v_new_id AND is_primary AND sort_order=0) THEN RAISE EXCEPTION 'reorder failed'; END IF;
  -- A shared physical object must not be returned for deletion.
  r := teswa_runtime.apply_owned_listing_image_plan(p || jsonb_build_object('orderedRows',jsonb_build_array(
    jsonb_build_object('kind','existing','imageId',v_new_id,'imageUrl',v_new_url))));
  IF r->>'code'<>'updated' OR jsonb_array_length(r->'removedImageUrls')<>0 THEN RAISE EXCEPTION 'shared object cleanup was unsafe'; END IF;
  -- Stale plans and database failures leave the current image untouched.
  r := teswa_runtime.apply_owned_listing_image_plan(p);
  IF r->>'code'<>'invalid_input' THEN RAISE EXCEPTION 'stale image accepted'; END IF;
  BEGIN
    PERFORM teswa_runtime.apply_owned_listing_image_plan(p || jsonb_build_object('orderedRows',jsonb_build_array(jsonb_build_object('kind','new','imageUrl','https://reject.example.test'))));
    RAISE EXCEPTION 'constraint failure not raised';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM public.item_images WHERE item_id=v_item)<>1 OR NOT EXISTS(SELECT 1 FROM public.item_images WHERE id=v_new_id AND is_primary) THEN RAISE EXCEPTION 'partial image update committed'; END IF;
  r := teswa_runtime.apply_owned_listing_image_plan(p || jsonb_build_object('itemId','77777777-7777-4777-8777-777777777777'));
  IF r->>'code'<>'not_editable' THEN RAISE EXCEPTION 'reserved item editable'; END IF;
  PERFORM set_config('teswa.user_id','22222222-2222-4222-8222-222222222222',true);
  r := teswa_runtime.apply_owned_listing_image_plan(p || jsonb_build_object('ownerId','22222222-2222-4222-8222-222222222222'));
  IF r->>'code'<>'not_found_or_unauthorized' THEN RAISE EXCEPTION 'owner RLS failed'; END IF;
  BEGIN
    PERFORM teswa_runtime.apply_owned_listing_image_plan(p);
    RAISE EXCEPTION 'spoofed actor accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
ROLLBACK;
\echo marketplace_image_plan_postgres=PASS
