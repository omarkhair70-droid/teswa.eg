\set ON_ERROR_STOP on

DO $$
declare
  v_count integer;
  v_bad integer;
  v_code text;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'create_story_reply_thread','ensure_story_reply_conversation','get_unread_contextual_messages_count',
    'guard_profiles_self_update','mark_contextual_thread_read','review_report','hide_item_for_moderation'
  );
  if v_count <> 7 then raise exception 'expected 7 final public runtime functions, found %',v_count; end if;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='teswa_internal' and p.proname in ('review_report','hide_item_for_moderation');
  if v_count <> 2 then raise exception 'expected 2 internal moderation functions, found %',v_count; end if;

  select count(*) into v_count from pg_roles
  where rolname='teswa_internal_moderation' and not rolcanlogin and not rolbypassrls and not rolsuper;
  if v_count <> 1 then raise exception 'internal moderation role is not narrow'; end if;

  if pg_has_role('teswa_app_authenticated','teswa_internal_moderation','member') then
    raise exception 'app role unexpectedly inherits internal moderation role';
  end if;

  if has_function_privilege('teswa_app_authenticated','teswa_internal.review_report(uuid,text,text,text,uuid)','EXECUTE') then
    raise exception 'app role can execute internal review_report';
  end if;
  if has_function_privilege('teswa_app_authenticated','teswa_internal.hide_item_for_moderation(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'app role can execute internal hide_item_for_moderation';
  end if;
  if not has_function_privilege('teswa_internal_moderation','teswa_internal.review_report(uuid,text,text,text,uuid)','EXECUTE') then
    raise exception 'internal moderation role missing review_report execute';
  end if;

  select count(*) into v_count from pg_policies
  where schemaname='public' and policyname in (
    'contextual_conversations_select_participants','contextual_message_reads_select_self_participant',
    'contextual_messages_insert_conversation_participants','contextual_messages_select_conversation_participants',
    'account_deletion_requests_authenticated_insert','creator_drops_admin_all','creator_drop_items_admin_all',
    'dolab_items_select_own','dolab_items_insert_own','dolab_items_update_own','dolab_items_delete_own',
    'dolab_media_select_own','dolab_media_insert_own','dolab_media_update_own','dolab_media_delete_own',
    'dolab_notes_select_own','dolab_notes_insert_own','dolab_notes_update_own','dolab_notes_delete_own',
    'featured_story_items_admin_all','feedback_admin_select','feedback_admin_update','feedback_self_insert','feedback_self_select',
    'item_likes_delete_own','item_likes_insert_own','profiles_self_insert','profiles_self_update',
    'Users can insert own policy acceptances','Users can read own policy acceptances'
  );
  if v_count <> 30 then raise exception 'expected 30 final RLS policies, found %',v_count; end if;

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and (pg_get_functiondef(p.oid) like '%auth.uid()%' or pg_get_functiondef(p.oid) like '%auth.role()%');
  if v_bad <> 0 then raise exception 'global function auth dependency remains: %',v_bad; end if;

  select count(*) into v_bad from pg_policies
  where schemaname='public'
    and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%'
         or coalesce(qual,'') like '%auth.role()%' or coalesce(with_check,'') like '%auth.role()%');
  if v_bad <> 0 then raise exception 'global policy auth dependency remains: %',v_bad; end if;

  if public.get_unread_contextual_messages_count() <> 0 then
    raise exception 'no-context contextual unread guard failed';
  end if;

  begin
    perform public.review_report(gen_random_uuid(),'reviewing',null,null);
    raise exception 'non-admin review_report unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end$$;

SELECT 'final_public_function_auth_dependency=0' AS result;
SELECT 'final_public_policy_auth_dependency=0' AS result;
SELECT 'final_privileged_moderation_contract=PASS' AS result;
SELECT 'runtime_final_db_closure=PASS' AS result;
