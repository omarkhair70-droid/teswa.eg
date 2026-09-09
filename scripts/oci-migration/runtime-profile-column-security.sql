\set ON_ERROR_STOP on
BEGIN;

-- Profiles mix public presentation fields with private/account-control fields.
-- Keep the API role on an explicit column allowlist; RLS alone cannot prevent a
-- future query from selecting every column of an otherwise visible row.
REVOKE SELECT,INSERT,UPDATE ON public.profiles FROM teswa_app_authenticated;
DO $block$
DECLARE column_name text;
BEGIN
  FOR column_name IN
    SELECT a.attname FROM pg_catalog.pg_attribute a
    WHERE a.attrelid='public.profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I) ON public.profiles FROM teswa_app_authenticated',
      column_name
    );
  END LOOP;
END
$block$;
GRANT USAGE ON SCHEMA public,teswa_runtime TO teswa_app_authenticated;
GRANT SELECT(id,display_name,username,bio,avatar_url,cover_url,city,area,
  profile_tagline,successful_swaps_count,response_rate,created_at,is_banned)
  ON public.profiles TO teswa_app_authenticated;
GRANT INSERT(id,display_name,username) ON public.profiles TO teswa_app_authenticated;
GRANT UPDATE(display_name,username,bio,avatar_url,cover_url,city,area,
  profile_tagline,direct_message_privacy,updated_at)
  ON public.profiles TO teswa_app_authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_authenticated_visible_select ON public.profiles;
CREATE POLICY profiles_authenticated_visible_select ON public.profiles
FOR SELECT TO teswa_app_authenticated
USING (id=teswa_runtime.current_user_id() OR coalesce(is_banned,false)=false);

CREATE OR REPLACE FUNCTION teswa_runtime.get_my_direct_message_privacy()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,teswa_runtime
AS $function$
  SELECT coalesce(p.direct_message_privacy::text,'everyone')
  FROM public.profiles p
  WHERE p.id=teswa_runtime.current_user_id()
$function$;
REVOKE ALL ON FUNCTION teswa_runtime.get_my_direct_message_privacy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_runtime.get_my_direct_message_privacy() TO teswa_app_authenticated;

COMMIT;
