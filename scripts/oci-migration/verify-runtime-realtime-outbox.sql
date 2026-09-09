\set ON_ERROR_STOP on

DO $$
DECLARE
  trigger_count integer;
  public_exec boolean;
BEGIN
  SELECT count(*) INTO trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal
    AND n.nspname='public'
    AND t.tgname='teswa_realtime_capture_change'
    AND c.relname IN (
      'deal_message_reads','deal_messages','deal_confirmations','swap_deals',
      'direct_conversations','direct_message_attachments','direct_message_reactions',
      'direct_messages','direct_typing_state','contextual_conversations',
      'contextual_messages','contextual_message_reads'
    );
  IF trigger_count <> 12 THEN RAISE EXCEPTION 'realtime trigger count mismatch: %', trigger_count; END IF;

  IF to_regprocedure('teswa_realtime.read_events(bigint,integer)') IS NULL THEN
    RAISE EXCEPTION 'realtime read_events function missing';
  END IF;
  IF to_regprocedure('teswa_realtime.latest_event_id()') IS NULL THEN
    RAISE EXCEPTION 'realtime latest_event_id function missing';
  END IF;
  SELECT has_function_privilege('public','teswa_realtime.read_events(bigint,integer)','EXECUTE') INTO public_exec;
  IF public_exec THEN RAISE EXCEPTION 'public execute must be revoked from realtime read_events'; END IF;
END;
$$;

SELECT m.id::text AS probe_message,
       m.conversation_id::text AS probe_conversation,
       c.participant_a::text AS probe_user
FROM public.direct_messages m
JOIN public.direct_conversations c ON c.id=m.conversation_id
ORDER BY m.created_at,m.id
LIMIT 1
\gset

SELECT id::text AS outsider_user
FROM teswa_identity.users
WHERE id NOT IN (
  SELECT participant_a FROM public.direct_conversations WHERE id=:'probe_conversation'::uuid
  UNION ALL
  SELECT participant_b FROM public.direct_conversations WHERE id=:'probe_conversation'::uuid
)
ORDER BY id
LIMIT 1
\gset

BEGIN;
SELECT set_config('teswa.user_id', :'probe_user', true);

SELECT coalesce(max(event_id),0) AS before_id FROM teswa_realtime.events \gset

UPDATE public.direct_messages SET body=body WHERE id=:'probe_message'::uuid;
UPDATE public.direct_messages SET body=body WHERE id=:'probe_message'::uuid;

SELECT count(*) AS produced,
       min(event_id) AS first_id,
       max(event_id) AS second_id
FROM teswa_realtime.events
WHERE event_id > :'before_id'::bigint
  AND source_table='direct_messages'
  AND row_id=:'probe_message'::uuid
\gset

SELECT 1 / ((:'produced'::int = 2)::int);
SELECT 1 / ((:'first_id'::bigint < :'second_id'::bigint)::int);

SELECT count(*) AS participant_visible
FROM teswa_realtime.read_events(:'before_id'::bigint,100)
WHERE row_id=:'probe_message'::uuid
\gset
SELECT 1 / ((:'participant_visible'::int = 2)::int);

SELECT count(*) AS catchup_visible
FROM teswa_realtime.read_events(:'first_id'::bigint,100)
WHERE row_id=:'probe_message'::uuid
\gset
SELECT 1 / ((:'catchup_visible'::int = 1)::int);

SELECT set_config('teswa.user_id', :'outsider_user', true);
SELECT count(*) AS outsider_visible
FROM teswa_realtime.read_events(:'before_id'::bigint,100)
WHERE row_id=:'probe_message'::uuid
\gset
SELECT 1 / ((:'outsider_visible'::int = 0)::int);

ROLLBACK;

SELECT 'teswa_realtime_outbox=PASS' AS result;
SELECT 'realtime_triggers=12' AS result;
SELECT 'realtime_catchup_ordering=PASS' AS result;
SELECT 'realtime_unauthorized_filter=PASS' AS result;
