-- Teswa-owned replacement primitive for Supabase auth.uid() semantics.
--
-- This file is intentionally NOT auto-applied. It is a runtime-layer building
-- block for the OCI rehearsal after identity persistence is GREEN.
--
-- Expected server usage inside one database transaction:
--   SELECT set_config('teswa.user_id', '<authenticated Teswa UUID>', true);
--   SELECT teswa_runtime.current_user_id();
--
-- The third set_config argument MUST remain true so identity context is
-- transaction-local and cannot leak through a pooled connection.

BEGIN;

CREATE SCHEMA IF NOT EXISTS teswa_runtime;
REVOKE ALL ON SCHEMA teswa_runtime FROM PUBLIC;

CREATE OR REPLACE FUNCTION teswa_runtime.current_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  raw_user_id text;
BEGIN
  raw_user_id := NULLIF(current_setting('teswa.user_id', true), '');
  IF raw_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN raw_user_id::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid teswa.user_id runtime context'
        USING ERRCODE = '22023';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION teswa_runtime.require_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  user_id uuid;
BEGIN
  user_id := teswa_runtime.current_user_id();
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'authenticated Teswa user context required'
      USING ERRCODE = '28000';
  END IF;
  RETURN user_id;
END;
$$;

REVOKE ALL ON FUNCTION teswa_runtime.current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION teswa_runtime.require_user_id() FROM PUBLIC;

COMMENT ON SCHEMA teswa_runtime IS
  'Teswa-owned database runtime primitives; not a public client API.';
COMMENT ON FUNCTION teswa_runtime.current_user_id() IS
  'Returns transaction-local authenticated Teswa UUID from teswa.user_id, or NULL.';
COMMENT ON FUNCTION teswa_runtime.require_user_id() IS
  'Returns transaction-local authenticated Teswa UUID or raises SQLSTATE 28000.';

COMMIT;
