-- Teswa Lane 4 direct messaging extended RPC port.
-- Rehearsal-only mechanical identity adaptation of the remaining direct-message RPCs.
-- Business bodies are preserved from the already-loaded canonical target definitions;
-- only auth.uid() is replaced by teswa_runtime.current_user_id().

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  target_names text[] := ARRAY[
    'accept_direct_message_request',
    'delete_direct_message_v2',
    'get_direct_conversation_messages',
    'ignore_direct_message_request',
    'mark_direct_conversation_read_v2',
    'send_direct_message',
    'send_direct_voice_message',
    'set_direct_typing_state_v2',
    'toggle_direct_message_reaction_v2'
  ];
  r record;
  ddl text;
  seen integer := 0;
BEGIN
  IF to_regprocedure('teswa_runtime.current_user_id()') IS NULL THEN
    RAISE EXCEPTION 'teswa runtime identity context missing';
  END IF;

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(target_names)
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
  LOOP
    seen := seen + 1;
    ddl := pg_get_functiondef(r.oid);
    IF position('auth.uid()' in ddl) > 0 THEN
      ddl := replace(ddl, 'auth.uid()', 'teswa_runtime.current_user_id()');
      EXECUTE ddl;
    END IF;
  END LOOP;

  IF seen <> 9 THEN
    RAISE EXCEPTION 'expected 9 direct messaging functions, found %', seen;
  END IF;
END;
$$;

COMMIT;
