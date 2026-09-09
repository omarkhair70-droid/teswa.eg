\set ON_ERROR_STOP on
CREATE ROLE teswa_app_authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE teswaapi LOGIN NOSUPERUSER NOBYPASSRLS;
GRANT teswa_app_authenticated TO teswaapi;
CREATE SCHEMA teswa_runtime;
CREATE SCHEMA teswa_identity;
CREATE SCHEMA teswa_auth;
CREATE FUNCTION teswa_runtime.require_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$SELECT current_setting('teswa.user_id')::uuid$$;
GRANT USAGE ON SCHEMA teswa_runtime TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION teswa_runtime.require_user_id() TO teswa_app_authenticated;
CREATE TABLE teswa_identity.users(id uuid PRIMARY KEY);
CREATE TABLE teswa_identity.external_identities(
  user_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE teswa_auth.sessions(
  user_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.account_deletion_requests(
  user_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.notifications(user_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE);
CREATE TABLE public.push_devices(user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE);
CREATE TABLE public.contextual_message_reads(user_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE);
CREATE TABLE public.contextual_conversations(
  id uuid PRIMARY KEY, starter_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.swap_deals(
  id uuid PRIMARY KEY, requester_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  offerer_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.deal_messages(
  deal_id uuid REFERENCES public.swap_deals(id) ON DELETE CASCADE
);
CREATE TABLE public.offers(
  sender_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.reviews(
  reviewer_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  reviewee_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.reports(
  reporter_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES teswa_identity.users(id) ON DELETE CASCADE
);
CREATE TABLE public.direct_conversations(
  participant_a uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_b uuid REFERENCES public.profiles(id) ON DELETE CASCADE
);

\ir runtime-account-deletion.sql

\set target 11111111-1111-4111-8111-111111111111
\set other 22222222-2222-4222-8222-222222222222
\set deal 33333333-3333-4333-8333-333333333333
\set convo 44444444-4444-4444-8444-444444444444
INSERT INTO teswa_identity.users VALUES(:'target'),(:'other');
INSERT INTO teswa_identity.external_identities VALUES(:'target'),(:'other');
INSERT INTO teswa_auth.sessions VALUES(:'target'),(:'other');
INSERT INTO public.profiles VALUES(:'target'),(:'other');
INSERT INTO public.account_deletion_requests VALUES(:'target');
INSERT INTO public.notifications VALUES(:'target'),(:'other');
INSERT INTO public.push_devices VALUES(:'target'),(:'other');
INSERT INTO public.contextual_message_reads VALUES(:'target'),(:'other');
INSERT INTO public.contextual_conversations VALUES(:'convo',:'target',:'other');
INSERT INTO public.swap_deals VALUES(:'deal',:'target',:'other');
INSERT INTO public.deal_messages VALUES(:'deal');
INSERT INTO public.offers VALUES(:'target',:'other');
INSERT INTO public.reviews VALUES(:'other',:'target');
INSERT INTO public.reports VALUES(:'other',:'target');
INSERT INTO public.direct_conversations VALUES(:'target',:'other');

SET ROLE teswaapi;
SELECT set_config('teswa.user_id', :'target', false);
SELECT teswa_account.delete_current_user() AS deleted \gset
\if :deleted
\else
  \quit 10
\endif
RESET ROLE;

DO $verify$
BEGIN
  IF EXISTS(SELECT 1 FROM teswa_identity.users WHERE id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'target identity still exists';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM teswa_identity.users WHERE id='22222222-2222-4222-8222-222222222222') THEN
    RAISE EXCEPTION 'other identity was deleted';
  END IF;
  IF EXISTS(SELECT 1 FROM public.notifications WHERE user_id='11111111-1111-4111-8111-111111111111')
     OR EXISTS(SELECT 1 FROM public.contextual_conversations WHERE starter_id='11111111-1111-4111-8111-111111111111' OR recipient_id='11111111-1111-4111-8111-111111111111')
     OR EXISTS(SELECT 1 FROM public.swap_deals WHERE requester_id='11111111-1111-4111-8111-111111111111' OR offerer_id='11111111-1111-4111-8111-111111111111')
     OR EXISTS(SELECT 1 FROM public.offers WHERE sender_id='11111111-1111-4111-8111-111111111111' OR receiver_id='11111111-1111-4111-8111-111111111111')
     OR EXISTS(SELECT 1 FROM public.reviews WHERE reviewer_id='11111111-1111-4111-8111-111111111111' OR reviewee_id='11111111-1111-4111-8111-111111111111')
     OR EXISTS(SELECT 1 FROM public.reports WHERE reporter_id='11111111-1111-4111-8111-111111111111' OR reported_user_id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'relational cleanup incomplete';
  END IF;
  IF has_function_privilege('public','teswa_account.delete_current_user()','EXECUTE') THEN
    RAISE EXCEPTION 'public account deletion execute leaked';
  END IF;
  IF has_table_privilege('teswa_app_authenticated','public.account_deletion_requests','INSERT') THEN
    RAISE EXCEPTION 'obsolete deletion queue insert remains granted';
  END IF;
END
$verify$;
SELECT 'account_deletion_postgres=PASS';
