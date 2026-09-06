\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $$
BEGIN
  IF current_database() <> 'teswa_rehearsal'
     OR current_setting('server_version_num')::int / 10000 <> 17
     OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'auth_email_service requires local PostgreSQL 17 teswa_rehearsal';
  END IF;
  IF to_regclass('teswa_auth.email_accounts') IS NULL
     OR to_regclass('teswa_auth.sessions') IS NULL
     OR to_regclass('teswa_identity.users') IS NULL THEN
    RAISE EXCEPTION 'auth email/session/identity foundation missing';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION teswa_auth.get_auth_user(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  email text,
  phone text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'teswa_auth','public','pg_catalog'
AS $fn$
  SELECT
    p.id,
    a.email,
    NULL::text AS phone,
    p.display_name,
    p.avatar_url
  FROM public.profiles p
  LEFT JOIN teswa_auth.email_accounts a ON a.user_id = p.id
  WHERE p.id = p_user_id
  LIMIT 1
$fn$;

REVOKE ALL ON FUNCTION teswa_auth.get_auth_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_auth.get_auth_user(uuid) TO teswaauth;

COMMIT;
SELECT 'runtime_auth_email_service=PASS' AS result;
