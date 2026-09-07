\set ON_ERROR_STOP on

-- Requires runtime-current-user-context.sql to have been applied on teswa_rehearsal.
-- Read-only verification except transaction-local GUC state.

DO $$
BEGIN
  IF to_regprocedure('teswa_runtime.current_user_id()') IS NULL THEN
    RAISE EXCEPTION 'teswa_runtime.current_user_id() missing';
  END IF;
  IF to_regprocedure('teswa_runtime.require_user_id()') IS NULL THEN
    RAISE EXCEPTION 'teswa_runtime.require_user_id() missing';
  END IF;
END;
$$;

BEGIN;

DO $$
BEGIN
  IF teswa_runtime.current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'runtime context must start NULL';
  END IF;
END;
$$;

SELECT set_config(
  'teswa.user_id',
  (SELECT id::text FROM teswa_identity.users ORDER BY id LIMIT 1),
  true
);

DO $$
DECLARE
  expected uuid;
  actual uuid;
BEGIN
  SELECT id INTO expected FROM teswa_identity.users ORDER BY id LIMIT 1;
  actual := teswa_runtime.current_user_id();
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'runtime context mismatch expected=% actual=%', expected, actual;
  END IF;
  IF teswa_runtime.require_user_id() IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'require_user_id mismatch';
  END IF;
END;
$$;

ROLLBACK;

DO $$
BEGIN
  IF teswa_runtime.current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'transaction-local runtime context leaked after rollback';
  END IF;
END;
$$;

SELECT 'teswa_runtime_current_user_context=PASS' AS result;
