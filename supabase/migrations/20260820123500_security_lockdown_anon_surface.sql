-- Close accidental anonymous/PUBLIC execution on SECURITY DEFINER functions.
--
-- Supabase may grant EXECUTE directly to anon/authenticated in addition to the
-- PostgreSQL PUBLIC grant. Historical migrations often revoked PUBLIC only,
-- leaving anon with a direct EXECUTE ACL. The mobile product requires auth for
-- user actions, so only the two explicitly public discovery aggregations remain
-- callable anonymously.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname not in (
        'get_public_moving_items',
        'get_public_city_pulse_moving_items'
      )
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
  end loop;
end
$$;

-- Preserve the intentionally anonymous, read-only discovery contracts.
revoke all on function public.get_public_moving_items(integer) from public;
grant execute on function public.get_public_moving_items(integer) to anon, authenticated, service_role;

revoke all on function public.get_public_city_pulse_moving_items(text[], integer) from public;
grant execute on function public.get_public_city_pulse_moving_items(text[], integer) to anon, authenticated, service_role;
