\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $$ BEGIN
  IF current_database() <> 'teswa_rehearsal' OR current_setting('server_version_num')::int/10000 <> 17 OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'auth_email_foundation requires local PostgreSQL 17 teswa_rehearsal';
  END IF;
  IF to_regclass('teswa_identity.users') IS NULL OR to_regclass('teswa_auth.sessions') IS NULL THEN
    RAISE EXCEPTION 'identity/session foundation missing';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS teswa_auth.email_accounts (
  user_id uuid PRIMARY KEY REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL CHECK (password_hash ~ '^\\$2[aby]\\$'),
  email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'teswa' CHECK (source IN ('teswa','supabase_migrated'))
);
CREATE UNIQUE INDEX IF NOT EXISTS teswa_auth_email_accounts_email_uq ON teswa_auth.email_accounts(lower(btrim(email)));
ALTER TABLE teswa_auth.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE teswa_auth.email_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON teswa_auth.email_accounts FROM PUBLIC, teswaauth;

CREATE TABLE IF NOT EXISTS teswa_auth.email_confirmation_tokens (
  token_sha256 text PRIMARY KEY CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS teswa_auth_email_confirmation_user_idx ON teswa_auth.email_confirmation_tokens(user_id,expires_at);
ALTER TABLE teswa_auth.email_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE teswa_auth.email_confirmation_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON teswa_auth.email_confirmation_tokens FROM PUBLIC, teswaauth;

CREATE OR REPLACE FUNCTION teswa_auth.verify_email_password(p_email text,p_password text)
RETURNS TABLE(user_id uuid,email_confirmed boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'teswa_auth','public','pg_catalog'
AS $fn$
  SELECT a.user_id, a.email_confirmed_at IS NOT NULL
  FROM teswa_auth.email_accounts a
  JOIN public.profiles p ON p.id=a.user_id
  WHERE lower(btrim(a.email))=lower(btrim(p_email))
    AND NOT coalesce(p.is_banned,false)
    AND a.password_hash = crypt(p_password,a.password_hash)
  LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION teswa_auth.bootstrap_email_signup(
  p_user_id uuid,p_email text,p_password text,p_display_name text,p_confirmation_sha256 text,p_confirmation_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'teswa_auth','teswa_identity','public','pg_catalog'
AS $fn$
DECLARE v_email text; v_display text; v_subject text;
BEGIN
  v_email:=lower(btrim(p_email));
  IF p_user_id IS NULL OR v_email='' OR position('@' in v_email)<2 OR length(p_password)<8 OR p_confirmation_sha256 !~ '^[0-9a-f]{64}$' OR p_confirmation_expires_at<=now() THEN
    RAISE EXCEPTION 'invalid_signup_input' USING errcode='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM teswa_auth.email_accounts WHERE lower(btrim(email))=v_email) THEN
    RAISE EXCEPTION 'email_already_registered' USING errcode='23505';
  END IF;
  INSERT INTO teswa_identity.users(id) VALUES(p_user_id);
  v_subject:=encode(digest('email:'||p_user_id::text,'sha256'),'hex');
  INSERT INTO teswa_identity.external_identities(provider,subject_sha256,user_id) VALUES('email',v_subject,p_user_id);
  v_display:=coalesce(nullif(btrim(p_display_name),''),split_part(v_email,'@',1),'مستخدم جديد');
  INSERT INTO public.profiles(id,display_name) VALUES(p_user_id,v_display);
  INSERT INTO teswa_auth.email_accounts(user_id,email,password_hash,email_confirmed_at,source)
  VALUES(p_user_id,v_email,crypt(p_password,gen_salt('bf',10)),NULL,'teswa');
  INSERT INTO teswa_auth.email_confirmation_tokens(token_sha256,user_id,expires_at)
  VALUES(p_confirmation_sha256,p_user_id,p_confirmation_expires_at);
  RETURN true;
END
$fn$;

CREATE OR REPLACE FUNCTION teswa_auth.rotate_email_confirmation(p_email text,p_new_sha256 text,p_expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $fn$
DECLARE v_user uuid;
BEGIN
  IF p_new_sha256 !~ '^[0-9a-f]{64}$' OR p_expires_at<=now() THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user FROM teswa_auth.email_accounts WHERE lower(btrim(email))=lower(btrim(p_email)) AND email_confirmed_at IS NULL;
  IF v_user IS NULL THEN RETURN NULL; END IF;
  DELETE FROM teswa_auth.email_confirmation_tokens WHERE user_id=v_user AND consumed_at IS NULL;
  INSERT INTO teswa_auth.email_confirmation_tokens(token_sha256,user_id,expires_at) VALUES(p_new_sha256,v_user,p_expires_at);
  RETURN v_user;
END
$fn$;

CREATE OR REPLACE FUNCTION teswa_auth.consume_email_confirmation(p_token_sha256 text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'teswa_auth','pg_catalog'
AS $fn$
DECLARE v_user uuid;
BEGIN
  UPDATE teswa_auth.email_confirmation_tokens
  SET consumed_at=now()
  WHERE token_sha256=p_token_sha256 AND consumed_at IS NULL AND expires_at>now()
  RETURNING user_id INTO v_user;
  IF v_user IS NULL THEN RETURN NULL; END IF;
  UPDATE teswa_auth.email_accounts SET email_confirmed_at=coalesce(email_confirmed_at,now()),updated_at=now() WHERE user_id=v_user;
  RETURN v_user;
END
$fn$;

CREATE OR REPLACE FUNCTION teswa_auth.import_legacy_email_account(p_user_id uuid,p_email text,p_password_hash text,p_confirmed_at timestamptz,p_created_at timestamptz,p_updated_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'teswa_auth','teswa_identity','pg_catalog'
AS $fn$
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM teswa_identity.users WHERE id=p_user_id) OR p_password_hash !~ '^\\$2[aby]\\$' THEN
    RAISE EXCEPTION 'invalid_legacy_email_account' USING errcode='22023';
  END IF;
  INSERT INTO teswa_auth.email_accounts(user_id,email,password_hash,email_confirmed_at,created_at,updated_at,source)
  VALUES(p_user_id,lower(btrim(p_email)),p_password_hash,p_confirmed_at,coalesce(p_created_at,now()),coalesce(p_updated_at,now()),'supabase_migrated')
  ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,email_confirmed_at=excluded.email_confirmed_at,updated_at=excluded.updated_at,source='supabase_migrated';
  RETURN true;
END
$fn$;

REVOKE ALL ON FUNCTION teswa_auth.verify_email_password(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.bootstrap_email_signup(uuid,text,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.rotate_email_confirmation(text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.consume_email_confirmation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_auth.import_legacy_email_account(uuid,text,text,timestamptz,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_auth.verify_email_password(text,text) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.bootstrap_email_signup(uuid,text,text,text,text,timestamptz) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.rotate_email_confirmation(text,text,timestamptz) TO teswaauth;
GRANT EXECUTE ON FUNCTION teswa_auth.consume_email_confirmation(text) TO teswaauth;
-- import_legacy_email_account intentionally remains postgres-only.

COMMIT;
SELECT 'runtime_auth_email_foundation=PASS' AS result;
