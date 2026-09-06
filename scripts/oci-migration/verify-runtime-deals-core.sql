\set ON_ERROR_STOP on

DO $$
DECLARE
  v_functions integer;
  v_policies integer;
  v_bad_functions integer;
  v_bad_policies integer;
BEGIN
  SELECT count(*) INTO v_functions
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'complete_deal_if_ready','get_unread_deal_messages_count','mark_deal_thread_read',
    'report_deal','report_deal_message','report_item'
  );
  IF v_functions<>6 THEN RAISE EXCEPTION 'expected 6 deals functions, found %',v_functions; END IF;

  SELECT count(*) INTO v_bad_functions
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'complete_deal_if_ready','get_unread_deal_messages_count','mark_deal_thread_read',
    'report_deal','report_deal_message','report_item'
  ) AND pg_get_functiondef(p.oid) LIKE '%auth.uid()%';
  IF v_bad_functions<>0 THEN RAISE EXCEPTION 'auth.uid remains in deals functions'; END IF;

  SELECT count(*) INTO v_policies FROM pg_policies
  WHERE schemaname='public' AND policyname IN (
    'deals_participant_select','deal_messages_participant_select','deal_messages_admin_select',
    'deal_messages_participant_insert','deal_message_reads_self_select','deal_message_reads_self_insert',
    'deal_message_reads_self_update','deal_confirmations_participant_select',
    'deal_confirmations_participant_insert','reviews_public_select','reviews_participant_completed_insert'
  );
  IF v_policies<>11 THEN RAISE EXCEPTION 'expected 11 deals policies, found %',v_policies; END IF;

  SELECT count(*) INTO v_bad_policies FROM pg_policies
  WHERE schemaname='public' AND policyname IN (
    'deals_participant_select','deal_messages_participant_select','deal_messages_admin_select',
    'deal_messages_participant_insert','deal_message_reads_self_select','deal_message_reads_self_insert',
    'deal_message_reads_self_update','deal_confirmations_participant_select',
    'deal_confirmations_participant_insert','reviews_public_select','reviews_participant_completed_insert'
  ) AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%');
  IF v_bad_policies<>0 THEN RAISE EXCEPTION 'auth.uid remains in deals policies'; END IF;

  IF (SELECT count(*) FROM public.swap_deals)=0 THEN RAISE EXCEPTION 'no rehearsal deal fixture available'; END IF;
END$$;

DO $$
DECLARE v integer;
BEGIN
  v:=public.get_unread_deal_messages_count();
  IF v<>0 THEN RAISE EXCEPTION 'unauth unread deal count must be zero, got %',v; END IF;
END$$;

BEGIN;
DO $$
DECLARE d record; v_result boolean; v_count integer;
BEGIN
  SELECT id,requester_id,offerer_id INTO d FROM public.swap_deals ORDER BY id LIMIT 1;
  PERFORM set_config('teswa.user_id',d.requester_id::text,true);
  PERFORM public.mark_deal_thread_read(d.id);
  SELECT count(*) INTO v_count FROM public.deal_message_reads WHERE deal_id=d.id AND user_id=d.requester_id;
  IF v_count<>1 THEN RAISE EXCEPTION 'mark read semantic probe failed'; END IF;
  IF public.get_unread_deal_messages_count()<0 THEN RAISE EXCEPTION 'negative unread count'; END IF;
  v_result:=public.complete_deal_if_ready(d.id);
  IF v_result IS NULL THEN RAISE EXCEPTION 'complete deal returned null'; END IF;
END$$;
ROLLBACK;

SELECT CASE WHEN teswa_runtime.current_user_id() IS NULL THEN 'runtime_deals_context_cleanup=PASS' ELSE 'runtime_deals_context_cleanup=FAIL' END;
SELECT 'runtime_deals_core=PASS' AS result;
