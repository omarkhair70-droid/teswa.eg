\set ON_ERROR_STOP on

DO $$
DECLARE
  trigger_count integer;
  public_table boolean;
  public_fn boolean;
BEGIN
  SELECT count(*) INTO trigger_count
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname='teswa_push_outbox_capture'
    AND tgrelid='public.notifications'::regclass;
  IF trigger_count <> 1 THEN RAISE EXCEPTION 'push outbox trigger count mismatch: %', trigger_count; END IF;

  SELECT has_table_privilege('public','teswa_jobs.push_outbox','SELECT') INTO public_table;
  IF public_table THEN RAISE EXCEPTION 'public can read push outbox'; END IF;

  SELECT has_function_privilege('public','teswa_jobs.capture_notification_insert()','EXECUTE') INTO public_fn;
  IF public_fn THEN RAISE EXCEPTION 'public can execute push capture trigger function'; END IF;
END;
$$;

BEGIN;

SELECT id::text AS probe_user
FROM teswa_identity.users
ORDER BY id
LIMIT 1
\gset

SELECT gen_random_uuid()::text AS probe_notification
\gset

INSERT INTO public.notifications(id,user_id,type,title,body)
VALUES (:'probe_notification'::uuid, :'probe_user'::uuid, 'system', 'Teswa worker rehearsal', 'rollback-only probe');

SELECT 1 / ((count(*) = 1)::int)
FROM teswa_jobs.push_outbox
WHERE notification_id=:'probe_notification'::uuid
  AND user_id=:'probe_user'::uuid
  AND notification_type='system'
  AND status='pending'
  AND attempts=0;

ROLLBACK;

SELECT 1 / ((count(*) = 0)::int)
FROM public.notifications
WHERE id=:'probe_notification'::uuid;

SELECT 1 / ((count(*) = 0)::int)
FROM teswa_jobs.push_outbox
WHERE notification_id=:'probe_notification'::uuid;

SELECT 'notification_push_outbox=PASS' AS result;
