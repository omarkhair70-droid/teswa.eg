-- Read-only regression contract for Teswa's privileged database surface.
do $$
declare
  t text;
  bad_count integer;
begin
  foreach t in array array[
    'profiles','items','offers','swap_deals','deal_messages','direct_conversations','direct_messages',
    'direct_message_attachments','direct_message_reactions','reports','notifications','push_devices','analytics_events'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity
    ) then
      raise exception 'RLS must be enabled on public.%', t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='marketplace_items'
      and coalesce(c.reloptions,'{}') @> array['security_invoker=true']
  ) then
    raise exception 'marketplace_items must use security_invoker=true';
  end if;

  if has_function_privilege('anon','public.increment_successful_swaps_for_users(uuid,uuid)','execute')
     or has_function_privilege('authenticated','public.increment_successful_swaps_for_users(uuid,uuid)','execute') then
    raise exception 'trust metric increment must be service-only';
  end if;

  if not has_function_privilege('service_role','public.increment_successful_swaps_for_users(uuid,uuid)','execute') then
    raise exception 'service role lost trust metric increment';
  end if;

  if has_function_privilege('anon','public.reserve_smart_notification_dispatch(uuid,text,text,text,text,uuid,jsonb)','execute')
     or has_function_privilege('authenticated','public.reserve_smart_notification_dispatch(uuid,text,text,text,text,uuid,jsonb)','execute') then
    raise exception 'smart notification reservation must be service-only';
  end if;

  select count(*) into bad_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('anon',p.oid,'execute')
    and p.proname not in ('get_public_moving_items','get_public_city_pulse_moving_items');

  if bad_count <> 0 then
    raise exception 'unexpected anon SECURITY DEFINER surface: %', bad_count;
  end if;
end
$$;

select 'security_surface_contract_ok' as result;
