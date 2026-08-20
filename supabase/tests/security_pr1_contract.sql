-- Read-only contract assertions for PR #1 security lockdown.
-- Run against a database where the matching migration has been applied.

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'marketplace_items'
      and coalesce(c.reloptions, '{}') @> array['security_invoker=true']
  ) then
    raise exception 'marketplace_items must use security_invoker=true';
  end if;

  if has_function_privilege('anon', 'public.increment_successful_swaps_for_users(uuid,uuid)', 'execute') then
    raise exception 'anon must not execute increment_successful_swaps_for_users';
  end if;

  if has_function_privilege('authenticated', 'public.increment_successful_swaps_for_users(uuid,uuid)', 'execute') then
    raise exception 'authenticated must not execute increment_successful_swaps_for_users';
  end if;

  if not has_function_privilege('service_role', 'public.increment_successful_swaps_for_users(uuid,uuid)', 'execute') then
    raise exception 'service_role must execute increment_successful_swaps_for_users';
  end if;

  if has_function_privilege('anon', 'public.reserve_smart_notification_dispatch(uuid,text,text,text,text,uuid,jsonb)', 'execute') then
    raise exception 'anon must not execute reserve_smart_notification_dispatch';
  end if;

  if has_function_privilege('authenticated', 'public.reserve_smart_notification_dispatch(uuid,text,text,text,text,uuid,jsonb)', 'execute') then
    raise exception 'authenticated must not execute reserve_smart_notification_dispatch';
  end if;

  if not has_function_privilege('service_role', 'public.reserve_smart_notification_dispatch(uuid,text,text,text,text,uuid,jsonb)', 'execute') then
    raise exception 'service_role must execute reserve_smart_notification_dispatch';
  end if;

  if has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,uuid,uuid,uuid,uuid)', 'execute') then
    raise exception 'anon must not execute create_notification';
  end if;

  if not has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,uuid,uuid,uuid,uuid)', 'execute') then
    raise exception 'authenticated must retain create_notification access';
  end if;

  if has_function_privilege('anon', 'public.review_report(uuid,text,text,text)', 'execute') then
    raise exception 'anon must not execute review_report';
  end if;

  if not has_function_privilege('authenticated', 'public.review_report(uuid,text,text,text)', 'execute') then
    raise exception 'authenticated must retain review_report access for the guarded admin UI';
  end if;

  if has_function_privilege('anon', 'public.hide_item_for_moderation(uuid,uuid)', 'execute') then
    raise exception 'anon must not execute hide_item_for_moderation';
  end if;

  if not has_function_privilege('authenticated', 'public.hide_item_for_moderation(uuid,uuid)', 'execute') then
    raise exception 'authenticated must retain hide_item_for_moderation access for the guarded admin UI';
  end if;
end
$$;

select 'security_pr1_contract_ok' as result;
