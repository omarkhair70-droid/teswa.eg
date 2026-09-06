\set ON_ERROR_STOP on

DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  bad_auth_uid text[] := ARRAY[]::text[];
  name text;
  oidv oid;
  def text;
  names text[] := ARRAY[
    'get_direct_conversation','get_my_direct_conversations','get_direct_native_messages',
    'start_or_get_direct_conversation','send_direct_native_message','start_direct_conversation_with_message'
  ];
BEGIN
  FOREACH name IN ARRAY names LOOP
    SELECT p.oid, pg_get_functiondef(p.oid)
      INTO oidv, def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=name
    ORDER BY p.oid DESC LIMIT 1;
    IF oidv IS NULL THEN
      missing := array_append(missing,name);
    ELSIF def LIKE '%auth.uid()%' OR def NOT LIKE '%teswa_runtime.current_user_id()%'
    THEN
      bad_auth_uid := array_append(bad_auth_uid,name);
    END IF;
  END LOOP;
  IF cardinality(missing) > 0 THEN RAISE EXCEPTION 'missing direct runtime functions: %', missing; END IF;
  IF cardinality(bad_auth_uid) > 0 THEN RAISE EXCEPTION 'identity port incomplete: %', bad_auth_uid; END IF;
END;
$$;

DO $$
DECLARE
  x record;
BEGIN
  SELECT * INTO x FROM public.start_or_get_direct_conversation(NULL::uuid) LIMIT 1;
  IF x.ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unauthenticated start_or_get must refuse';
  END IF;
END;
$$;

BEGIN;
SELECT set_config('teswa.user_id',(SELECT id::text FROM teswa_identity.users ORDER BY id LIMIT 1),true);

DO $$
DECLARE
  a uuid;
  b uuid;
  s record;
  m record;
  c_count bigint;
  msg_count bigint;
BEGIN
  SELECT id INTO a FROM teswa_identity.users ORDER BY id LIMIT 1;
  SELECT id INTO b FROM teswa_identity.users ORDER BY id OFFSET 1 LIMIT 1;
  IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'need two identity users'; END IF;

  SELECT * INTO s FROM public.start_or_get_direct_conversation(a) LIMIT 1;
  IF s.ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'self conversation must refuse'; END IF;

  SELECT * INTO s FROM public.start_or_get_direct_conversation(b) LIMIT 1;
  IF s.ok IS DISTINCT FROM true OR s.conversation_id IS NULL THEN
    RAISE EXCEPTION 'two-user conversation start failed';
  END IF;

  SELECT * INTO m FROM public.send_direct_native_message(
    s.conversation_id,'lane4 runtime rehearsal',NULL,'[]'::jsonb,'{"lane4_rehearsal":true}'::jsonb
  ) LIMIT 1;
  IF m.ok IS DISTINCT FROM true OR m.message_id IS NULL THEN
    RAISE EXCEPTION 'direct native send failed';
  END IF;

  SELECT count(*) INTO c_count FROM public.get_my_direct_conversations();
  IF c_count < 1 THEN RAISE EXCEPTION 'conversation list did not expose rehearsal conversation'; END IF;

  SELECT count(*) INTO msg_count FROM public.get_direct_native_messages(s.conversation_id,100,NULL);
  IF msg_count < 1 THEN RAISE EXCEPTION 'native message list did not expose rehearsal message'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.get_direct_conversation(s.conversation_id)) THEN
    RAISE EXCEPTION 'direct conversation detail missing';
  END IF;
END;
$$;
ROLLBACK;

DO $$
BEGIN
  IF teswa_runtime.current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'runtime user context leaked after direct messaging rehearsal rollback';
  END IF;
END;
$$;

SELECT count(*) AS direct_runtime_functions
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'get_direct_conversation','get_my_direct_conversations','get_direct_native_messages',
  'start_or_get_direct_conversation','send_direct_native_message','start_direct_conversation_with_message'
);

SELECT 'runtime_direct_messaging_core=PASS' AS result;
