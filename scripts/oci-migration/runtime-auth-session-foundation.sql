\set ON_ERROR_STOP on

-- Teswa Lane 4 durable Auth session foundation for OCI rehearsal.
-- Shadow only: no production traffic switch, no Supabase mutation.
-- Raw refresh tokens are never persisted; only SHA-256 digests are stored.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF current_database() <> 'teswa_rehearsal'
     OR current_setting('server_version_num')::int / 10000 <> 17
     OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'auth_session_foundation requires local PostgreSQL 17 teswa_rehearsal';
  END IF;
  IF to_regclass('teswa_identity.users') IS NULL THEN
    RAISE EXCEPTION 'teswa_identity.users missing';
  END IF;
  IF (SELECT count(*) FROM teswa_identity.users) <> 32 THEN
    RAISE EXCEPTION 'identity user count drift';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswaauth') THEN
    CREATE ROLE teswaauth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END$$;
ALTER ROLE teswaauth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

CREATE SCHEMA IF NOT EXISTS teswa_auth;
REVOKE ALL ON SCHEMA teswa_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA teswa_auth TO teswaauth;

CREATE TABLE IF NOT EXISTS teswa_auth.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','email')),
  refresh_token_sha256 text NOT NULL UNIQUE CHECK (refresh_token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_rotated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text
);
CREATE INDEX IF NOT EXISTS teswa_auth_sessions_user_active_idx
  ON teswa_auth.sessions(user_id, expires_at) WHERE revoked_at IS NULL;
ALTER TABLE teswa_auth.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teswa_auth.sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON teswa_auth.sessions FROM PUBLIC;
REVOKE ALL ON teswa_auth.sessions FROM teswaauth;

DO $$
DECLARE
  v_cols integer;
BEGIN
  SELECT count(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema='teswa_auth' AND table_name='sessions'
    AND (column_name,data_type) IN (
      ('id','uuid'),('user_id','uuid'),('provider','text'),('refresh_token_sha256','text'),
      ('created_at','timestamp with time zone'),('last_rotated_at','timestamp with time zone'),
      ('expires_at','timestamp with time zone'),('revoked_at','timestamp with time zone'),('revoke_reason','text')
    );
  IF v_cols <> 9 OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='teswa_auth' AND table_name='sessions') <> 9 THEN
    RAISE EXCEPTION 'unexpected teswa_auth.sessions shape';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION teswa_auth.create_session(
  p_session_id uuid,
  p_user_id uuid,
  p_provider text,
  p_refresh_sha256 text,
  p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'teswa_auth','teswa_identity','pg_catalog'
AS $function$
BEGIN
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_provider NOT IN ('google','email')
     OR p_refresh_sha256 !~ '^[0-9a-f]{64}$' OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_session_input' USING errcode='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teswa_identity.users WHERE id=p_user_id) THEN
    RAISE EXCEPTION 'unknown_user' USING errcode='23503';
  END IF;
  INSERT INTO teswa_auth.sessions(id,user_id,provider,refresh_token_sha256,expires_at)
  VALUES(p_session_id,p_user_id,p_provider,p_refresh_sha256,p_expires_at);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION teswa_auth.rotate_refresh(
  p_old_sha256 text,
  p_new_sha256 text,
  p_new_expires_at timestamptz
) RETURNS TABLE(session_id uuid,user_id uuid,provider text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $function$
DECLARE v teswa_auth.sessions%rowtype;
BEGIN
  IF p_old_sha256 !~ '^[0-9a-f]{64}$' OR p_new_sha256 !~ '^[0-9a-f]{64}$'
     OR p_old_sha256=p_new_sha256 OR p_new_expires_at <= now() THEN
    RETURN;
  END IF;
  SELECT * INTO v FROM teswa_auth.sessions
  WHERE refresh_token_sha256=p_old_sha256 AND revoked_at IS NULL AND expires_at>now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE teswa_auth.sessions
  SET refresh_token_sha256=p_new_sha256,last_rotated_at=now(),expires_at=p_new_expires_at
  WHERE id=v.id;
  session_id:=v.id; user_id:=v.user_id; provider:=v.provider;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION teswa_auth.validate_session(p_session_id uuid,p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM teswa_auth.sessions
    WHERE id=p_session_id AND user_id=p_user_id AND revoked_at IS NULL AND expires_at>now()
  );
$function$;

CREATE OR REPLACE FUNCTION teswa_auth.revoke_session(p_session_id uuid,p_user_id uuid,p_reason text DEFAULT 'logout')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $function$
DECLARE v_rows integer;
BEGIN
  UPDATE teswa_auth.sessions
  SET revoked_at=coalesce(revoked_at,now()), revoke_reason=coalesce(revoke_reason,nullif(btrim(p_reason),''),'logout')
  WHERE id=p_session_id AND user_id=p_user_id;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows>0;
END;
$function$;

CREATE OR REPLACE FUNCTION teswa_auth.revoke_user_sessions(p_user_id uuid,p_reason text DEFAULT 'account_lifecycle')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $function$
DECLARE v_rows integer;
BEGIN
  UPDATE teswa_auth.sessions
  SET revoked_at=coalesce(revoked_at,now()), revoke_reason=coalesce(revoke_reason,nullif(btrim(p_reason),''),'account_lifecycle')
  WHERE user_id=p_user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION teswa_auth.cleanup_revoked_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $function$
DECLARE v_rows integer;
BEGIN
  DELETE FROM teswa_auth.sessions WHERE id=p_session_id AND revoked_at IS NOT NULL;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows>0;
END;
$function$;

CREATE OR REPLACE FUNCTION teswa_auth.active_session_count()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $function$
  SELECT count(*) FROM teswa_auth.sessions WHERE revoked_at IS NULL AND expires_at>now();
$function$;

REVOKE ALL ON FUNCTION teswa_auth.create_session(uuid,uuid,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.rotate_refresh(text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.validate_session(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.revoke_session(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.revoke_user_sessions(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.cleanup_revoked_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.active_session_count() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION teswa_auth.create_session(uuid,uuid,text,text,timestamptz) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.rotate_refresh(text,text,timestamptz) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.validate_session(uuid,uuid) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.revoke_session(uuid,uuid,text) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.revoke_user_sessions(uuid,text) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.cleanup_revoked_session(uuid) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.active_session_count() TO teswaauth;

COMMIT;
SELECT 'runtime_auth_session_foundation=PASS' AS result;
