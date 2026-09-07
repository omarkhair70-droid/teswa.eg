\set ON_ERROR_STOP on

-- Structural checks plus role-based semantic verification.

DO $$
DECLARE
  policy_count integer;
  bad_identity integer;
  r record;
BEGIN
  SELECT count(*), count(*) FILTER (
    WHERE coalesce(qual,'') LIKE '%auth.uid()%'
       OR coalesce(qual,'') NOT LIKE '%teswa_runtime.current_user_id()%'
  )
  INTO policy_count, bad_identity
  FROM pg_policies
  WHERE schemaname='public'
    AND policyname IN (
      'direct_conversations_select_participant',
      'direct_messages_select_participant',
      'direct_message_attachments_select_participants',
      'direct_message_reactions_select_participants',
      'direct_typing_state_select_participants'
    );

  IF policy_count <> 5 THEN
    RAISE EXCEPTION 'direct messaging RLS policy count mismatch: %', policy_count;
  END IF;
  IF bad_identity <> 0 THEN
    RAISE EXCEPTION 'direct messaging RLS identity adaptation mismatch: %', bad_identity;
  END IF;

  SELECT rolcanlogin, rolsuper, rolbypassrls
  INTO r
  FROM pg_roles
  WHERE rolname='teswa_app_authenticated';
  IF NOT FOUND THEN RAISE EXCEPTION 'teswa_app_authenticated role missing'; END IF;
  IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls THEN
    RAISE EXCEPTION 'teswa_app_authenticated role is too privileged';
  END IF;
END;
$$;

SELECT id::text AS probe_user
FROM teswa_identity.users
ORDER BY id
LIMIT 1
\gset

SELECT count(*) AS expected_conversations
FROM public.direct_conversations
WHERE participant_a = :'probe_user'::uuid OR participant_b = :'probe_user'::uuid
\gset

SELECT count(*) AS expected_messages
FROM public.direct_messages m
WHERE EXISTS (
  SELECT 1 FROM public.direct_conversations c
  WHERE c.id=m.conversation_id
    AND (c.participant_a = :'probe_user'::uuid OR c.participant_b = :'probe_user'::uuid)
)
\gset

SELECT count(*) AS expected_attachments
FROM public.direct_message_attachments a
WHERE EXISTS (
  SELECT 1 FROM public.direct_conversations c
  WHERE c.id=a.conversation_id
    AND (c.participant_a = :'probe_user'::uuid OR c.participant_b = :'probe_user'::uuid)
)
\gset

SELECT count(*) AS expected_reactions
FROM public.direct_message_reactions r
WHERE EXISTS (
  SELECT 1 FROM public.direct_conversations c
  WHERE c.id=r.conversation_id
    AND (c.participant_a = :'probe_user'::uuid OR c.participant_b = :'probe_user'::uuid)
)
\gset

SELECT count(*) AS expected_typing
FROM public.direct_typing_state t
WHERE EXISTS (
  SELECT 1 FROM public.direct_conversations c
  WHERE c.id=t.conversation_id
    AND (c.participant_a = :'probe_user'::uuid OR c.participant_b = :'probe_user'::uuid)
)
\gset

BEGIN;
SET LOCAL ROLE teswa_app_authenticated;

-- No runtime identity means no participant rows are visible.
SELECT 1 / ((count(*) = 0)::int) FROM public.direct_conversations;
SELECT 1 / ((count(*) = 0)::int) FROM public.direct_messages;
SELECT 1 / ((count(*) = 0)::int) FROM public.direct_message_attachments;
SELECT 1 / ((count(*) = 0)::int) FROM public.direct_message_reactions;
SELECT 1 / ((count(*) = 0)::int) FROM public.direct_typing_state;

SELECT set_config('teswa.user_id', :'probe_user', true);

-- With a verified Teswa UUID, each table must expose exactly the rows that
-- belong to conversations where that UUID is a participant.
SELECT 1 / ((count(*) = :'expected_conversations'::bigint)::int) FROM public.direct_conversations;
SELECT 1 / ((count(*) = :'expected_messages'::bigint)::int) FROM public.direct_messages;
SELECT 1 / ((count(*) = :'expected_attachments'::bigint)::int) FROM public.direct_message_attachments;
SELECT 1 / ((count(*) = :'expected_reactions'::bigint)::int) FROM public.direct_message_reactions;
SELECT 1 / ((count(*) = :'expected_typing'::bigint)::int) FROM public.direct_typing_state;

ROLLBACK;

SELECT 'runtime_direct_messaging_rls=PASS' AS result;
