\set ON_ERROR_STOP on

-- Teswa Lane 4 direct-messaging RLS port.
-- Source semantics: current production participant-only SELECT policies.
-- OCI semantics: the app-facing database role is NOLOGIN/NOBYPASSRLS and
-- obtains identity only from the transaction-local teswa.user_id context.
-- Rehearsal target only; no production cutover.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'teswa_app_authenticated') THEN
    CREATE ROLE teswa_app_authenticated
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;

ALTER ROLE teswa_app_authenticated
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public, teswa_runtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.current_user_id() TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.require_user_id() TO teswa_app_authenticated;
GRANT SELECT ON TABLE
  public.direct_conversations,
  public.direct_messages,
  public.direct_message_attachments,
  public.direct_message_reactions,
  public.direct_typing_state
TO teswa_app_authenticated;

ALTER TABLE public.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_typing_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS direct_conversations_select_participant ON public.direct_conversations;
CREATE POLICY direct_conversations_select_participant
ON public.direct_conversations
FOR SELECT
TO teswa_app_authenticated
USING (
  teswa_runtime.current_user_id() = participant_a
  OR teswa_runtime.current_user_id() = participant_b
);

DROP POLICY IF EXISTS direct_messages_select_participant ON public.direct_messages;
CREATE POLICY direct_messages_select_participant
ON public.direct_messages
FOR SELECT
TO teswa_app_authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.direct_conversations c
    WHERE c.id = direct_messages.conversation_id
      AND (
        teswa_runtime.current_user_id() = c.participant_a
        OR teswa_runtime.current_user_id() = c.participant_b
      )
  )
);

DROP POLICY IF EXISTS direct_message_attachments_select_participants ON public.direct_message_attachments;
CREATE POLICY direct_message_attachments_select_participants
ON public.direct_message_attachments
FOR SELECT
TO teswa_app_authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.direct_conversations c
    WHERE c.id = direct_message_attachments.conversation_id
      AND (
        teswa_runtime.current_user_id() = c.participant_a
        OR teswa_runtime.current_user_id() = c.participant_b
      )
  )
);

DROP POLICY IF EXISTS direct_message_reactions_select_participants ON public.direct_message_reactions;
CREATE POLICY direct_message_reactions_select_participants
ON public.direct_message_reactions
FOR SELECT
TO teswa_app_authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.direct_conversations c
    WHERE c.id = direct_message_reactions.conversation_id
      AND (
        teswa_runtime.current_user_id() = c.participant_a
        OR teswa_runtime.current_user_id() = c.participant_b
      )
  )
);

DROP POLICY IF EXISTS direct_typing_state_select_participants ON public.direct_typing_state;
CREATE POLICY direct_typing_state_select_participants
ON public.direct_typing_state
FOR SELECT
TO teswa_app_authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.direct_conversations c
    WHERE c.id = direct_typing_state.conversation_id
      AND (
        teswa_runtime.current_user_id() = c.participant_a
        OR teswa_runtime.current_user_id() = c.participant_b
      )
  )
);

COMMIT;
