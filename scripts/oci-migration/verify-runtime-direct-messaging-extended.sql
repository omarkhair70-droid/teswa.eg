\set ON_ERROR_STOP on

-- Structural verification plus rollback-only semantic probes.
DO $$
DECLARE
  remaining integer;
  total integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE pg_get_functiondef(p.oid) LIKE '%auth.uid()%')
  INTO total, remaining
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN (
      'accept_direct_message_request','delete_direct_message_v2','get_direct_conversation_messages',
      'ignore_direct_message_request','mark_direct_conversation_read_v2','send_direct_message',
      'send_direct_voice_message','set_direct_typing_state_v2','toggle_direct_message_reaction_v2'
    );
  IF total <> 9 THEN RAISE EXCEPTION 'extended direct function count mismatch: %', total; END IF;
  IF remaining <> 0 THEN RAISE EXCEPTION 'auth.uid remains in % extended direct functions', remaining; END IF;
END;
$$;

BEGIN;
SELECT set_config('teswa.user_id',(SELECT id::text FROM teswa_identity.users ORDER BY id LIMIT 1),true);

DO $$
DECLARE
  r record;
  n integer;
  b boolean;
BEGIN
  SELECT * INTO r FROM public.send_direct_message(NULL,'probe') LIMIT 1;
  IF r.ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'send_direct_message NULL guard changed'; END IF;

  SELECT * INTO r FROM public.send_direct_voice_message(NULL,'probe/path') LIMIT 1;
  IF r.ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'send_direct_voice_message NULL guard changed'; END IF;

  SELECT * INTO r FROM public.delete_direct_message_v2(NULL) LIMIT 1;
  IF r.ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'delete_direct_message_v2 NULL guard changed'; END IF;

  SELECT * INTO r FROM public.toggle_direct_message_reaction_v2(NULL,'love') LIMIT 1;
  IF r.ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'toggle_direct_message_reaction_v2 NULL guard changed'; END IF;

  SELECT * INTO r FROM public.mark_direct_conversation_read_v2(NULL) LIMIT 1;
  IF r.ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'mark_direct_conversation_read_v2 NULL guard changed'; END IF;

  SELECT count(*) INTO n FROM public.get_direct_conversation_messages(NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'get_direct_conversation_messages NULL guard changed'; END IF;

  SELECT public.set_direct_typing_state_v2(NULL,false) INTO b;
  IF b IS DISTINCT FROM false THEN RAISE EXCEPTION 'set_direct_typing_state_v2 NULL guard changed'; END IF;
END;
$$;
ROLLBACK;

SELECT 'runtime_direct_messaging_extended=PASS' AS result;
