\set ON_ERROR_STOP on
-- Disposable CI database only. Never run this fixture against Teswa rehearsal or production.
CREATE ROLE teswa_app_authenticated NOLOGIN NOBYPASSRLS;
CREATE ROLE teswa_edit_unauthorized NOLOGIN NOBYPASSRLS;
CREATE SCHEMA teswa_runtime;
CREATE TYPE public.item_status AS ENUM ('active','archived','reserved','swapped');
CREATE FUNCTION teswa_runtime.current_user_id() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('teswa.user_id',true),'')::uuid $$;
CREATE FUNCTION teswa_runtime.require_user_id() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v uuid := teswa_runtime.current_user_id();
BEGIN IF v IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF; RETURN v; END $$;
GRANT USAGE ON SCHEMA public,teswa_runtime TO teswa_app_authenticated;
GRANT USAGE ON SCHEMA teswa_runtime TO teswa_edit_unauthorized;
GRANT EXECUTE ON FUNCTION teswa_runtime.current_user_id(),teswa_runtime.require_user_id() TO teswa_app_authenticated;
CREATE TABLE public.items (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, status public.item_status NOT NULL,
  title text NOT NULL, category_id uuid, city text, area text, condition text,
  condition_notes text, description text, item_story text, swap_reason text, good_for text,
  desire_mode text, desire_text text, location_latitude double precision,
  location_longitude double precision, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.item_wanted_tags (
  item_id uuid NOT NULL REFERENCES public.items(id), tag text NOT NULL,
  PRIMARY KEY(item_id,tag), CONSTRAINT reject_test_tag CHECK (tag <> 'reject')
);
GRANT SELECT,UPDATE ON public.items TO teswa_app_authenticated;
GRANT SELECT,INSERT,DELETE ON public.item_wanted_tags TO teswa_app_authenticated;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_wanted_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY items_owner ON public.items FOR ALL TO teswa_app_authenticated
USING (owner_id=teswa_runtime.current_user_id())
WITH CHECK (owner_id=teswa_runtime.current_user_id());
CREATE POLICY tags_owner ON public.item_wanted_tags FOR ALL TO teswa_app_authenticated
USING (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_id AND i.owner_id=teswa_runtime.current_user_id()))
WITH CHECK (EXISTS(SELECT 1 FROM public.items i WHERE i.id=item_id AND i.owner_id=teswa_runtime.current_user_id()));
INSERT INTO public.items(id,owner_id,status,title,city,area,condition,desire_mode,location_latitude,location_longitude)
VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','active','Old','Cairo',NULL,'good_used','flexible',30,31),
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','reserved','Reserved','Cairo',NULL,'good_used','flexible',30,31);
INSERT INTO public.item_wanted_tags VALUES('33333333-3333-4333-8333-333333333333','old');
\ir runtime-marketplace-edit.sql
DO $$ BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname='teswa_app_authenticated') THEN RAISE EXCEPTION 'bypass role'; END IF;
  IF has_function_privilege('teswa_edit_unauthorized','teswa_runtime.update_owned_listing_core(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'public execution grant'; END IF;
END $$;

BEGIN;
SET LOCAL ROLE teswa_app_authenticated;
SELECT set_config('teswa.user_id','11111111-1111-4111-8111-111111111111',true);
DO $test$
DECLARE
  p jsonb := jsonb_build_object(
    'itemId','33333333-3333-4333-8333-333333333333',
    'ownerId','11111111-1111-4111-8111-111111111111',
    'title','New','categoryId',NULL,'city','Cairo','area',NULL,
    'condition','good_used','conditionNotes',NULL,'description','Description',
    'itemStory',NULL,'swapReason',NULL,'goodFor',NULL,'desireMode','flexible',
    'desireText',NULL,'wantedTags',jsonb_build_array('book','book','art'));
  v_code text;
BEGIN
  v_code := teswa_runtime.update_owned_listing_core(p);
  IF v_code <> 'updated' THEN RAISE EXCEPTION 'update failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.items WHERE title='New' AND location_latitude=30 AND location_longitude=31) THEN RAISE EXCEPTION 'same location changed'; END IF;
  IF (SELECT count(*) FROM public.item_wanted_tags WHERE tag IN ('book','art')) <> 2 THEN RAISE EXCEPTION 'tags not updated'; END IF;
  v_code := teswa_runtime.update_owned_listing_core(p || jsonb_build_object('itemId','44444444-4444-4444-8444-444444444444'));
  IF v_code <> 'not_editable' THEN RAISE EXCEPTION 'reserved item editable'; END IF;
  PERFORM set_config('teswa.user_id','22222222-2222-4222-8222-222222222222',true);
  v_code := teswa_runtime.update_owned_listing_core(p || jsonb_build_object('ownerId','22222222-2222-4222-8222-222222222222'));
  IF v_code <> 'not_found_or_unauthorized' THEN RAISE EXCEPTION 'owner check failed'; END IF;
  BEGIN
    PERFORM teswa_runtime.update_owned_listing_core(p);
    RAISE EXCEPTION 'spoofed owner accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('teswa.user_id','11111111-1111-4111-8111-111111111111',true);
  BEGIN
    PERFORM teswa_runtime.update_owned_listing_core(p || jsonb_build_object('title','Should rollback','wantedTags',jsonb_build_array('reject')));
    RAISE EXCEPTION 'constraint failure not raised';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.items WHERE id='33333333-3333-4333-8333-333333333333' AND title='New')
     OR (SELECT count(*) FROM public.item_wanted_tags WHERE tag IN ('book','art')) <> 2 THEN
    RAISE EXCEPTION 'partial transaction committed';
  END IF;
  v_code := teswa_runtime.update_owned_listing_core(p || jsonb_build_object('city','Giza','wantedTags','[]'::jsonb));
  IF v_code <> 'updated' THEN RAISE EXCEPTION 'location update failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.items WHERE id='33333333-3333-4333-8333-333333333333' AND location_latitude IS NULL AND location_longitude IS NULL)
     OR EXISTS(SELECT 1 FROM public.item_wanted_tags WHERE item_id='33333333-3333-4333-8333-333333333333') THEN
    RAISE EXCEPTION 'location or tags not cleared';
  END IF;
END $test$;
ROLLBACK;
\echo marketplace_edit_postgres=PASS
