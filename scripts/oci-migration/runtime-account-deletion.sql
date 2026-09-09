\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA IF NOT EXISTS teswa_account;
REVOKE ALL ON SCHEMA teswa_account FROM PUBLIC;
GRANT USAGE ON SCHEMA teswa_account TO teswa_app_authenticated;
REVOKE INSERT ON public.account_deletion_requests FROM teswa_app_authenticated;

CREATE OR REPLACE FUNCTION teswa_account.delete_current_user()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog,public,teswa_identity,teswa_auth,teswa_runtime
AS $function$
DECLARE
  v_user_id uuid := teswa_runtime.require_user_id();
BEGIN
  -- Shared records follow the current production delete-account behavior.
  -- Remaining owned rows follow their existing identity/profile FK actions.
  DELETE FROM public.notifications WHERE user_id=v_user_id;
  DELETE FROM public.push_devices WHERE user_id=v_user_id;
  DELETE FROM public.contextual_message_reads WHERE user_id=v_user_id;
  DELETE FROM public.contextual_conversations
    WHERE starter_id=v_user_id OR recipient_id=v_user_id;
  DELETE FROM public.deal_messages WHERE deal_id IN (
    SELECT id FROM public.swap_deals
    WHERE requester_id=v_user_id OR offerer_id=v_user_id
  );
  DELETE FROM public.swap_deals
    WHERE requester_id=v_user_id OR offerer_id=v_user_id;
  DELETE FROM public.offers
    WHERE sender_id=v_user_id OR receiver_id=v_user_id;
  DELETE FROM public.reviews
    WHERE reviewer_id=v_user_id OR reviewee_id=v_user_id;
  DELETE FROM public.reports
    WHERE reporter_id=v_user_id OR reported_user_id=v_user_id;
  DELETE FROM teswa_identity.users WHERE id=v_user_id;
  RETURN FOUND;
END
$function$;

REVOKE ALL ON FUNCTION teswa_account.delete_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teswa_account.delete_current_user() TO teswa_app_authenticated;

COMMIT;
