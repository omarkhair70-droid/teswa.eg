\set ON_ERROR_STOP on
CREATE ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA teswa_runtime;
CREATE FUNCTION teswa_runtime.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('teswa.user_id',true),'')::uuid$$;
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY, display_name text, username text, bio text, avatar_url text,
  cover_url text, city text, area text, profile_tagline text,
  successful_swaps_count integer, response_rate numeric, created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), is_banned boolean DEFAULT false,
  direct_message_privacy text DEFAULT 'everyone', role text DEFAULT 'user',
  private_note text
);
INSERT INTO public.profiles(id,display_name,username,direct_message_privacy,is_banned,private_note)
VALUES
  ('11111111-1111-4111-8111-111111111111','Self','self','followers_only',false,'self secret'),
  ('22222222-2222-4222-8222-222222222222','Public','public','no_one',false,'other secret'),
  ('33333333-3333-4333-8333-333333333333','Banned','banned','no_one',true,'banned secret');

\ir runtime-profile-column-security.sql

SET ROLE teswa_app_authenticated;
SET teswa.user_id='11111111-1111-4111-8111-111111111111';
SELECT id,display_name FROM public.profiles ORDER BY id;
SELECT teswa_runtime.get_my_direct_message_privacy();
UPDATE public.profiles SET bio='updated' WHERE id='11111111-1111-4111-8111-111111111111';

DO $$
DECLARE visible integer;
BEGIN
  SELECT count(*) INTO visible FROM public.profiles;
  IF visible <> 2 THEN RAISE EXCEPTION 'profile RLS visible rows %, expected 2',visible; END IF;
  BEGIN
    PERFORM direct_message_privacy FROM public.profiles;
    RAISE EXCEPTION 'private column unexpectedly selectable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.profiles SET role='admin' WHERE id='11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'protected column unexpectedly writable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE table_select boolean; leaked integer;
BEGIN
  SELECT has_table_privilege('teswa_app_authenticated','public.profiles','SELECT') INTO table_select;
  IF table_select THEN RAISE EXCEPTION 'table-wide SELECT remains'; END IF;
  SELECT count(*) INTO leaked FROM information_schema.columns c
   WHERE c.table_schema='public' AND c.table_name='profiles'
     AND NOT c.column_name=ANY(ARRAY['id','display_name','username','bio','avatar_url','cover_url','city','area','profile_tagline','successful_swaps_count','response_rate','created_at','is_banned'])
     AND has_column_privilege('teswa_app_authenticated','public.profiles',c.column_name,'SELECT');
  IF leaked <> 0 THEN RAISE EXCEPTION 'private profile columns selectable: %',leaked; END IF;
END $$;
SELECT 'profile_column_security=PASS';
