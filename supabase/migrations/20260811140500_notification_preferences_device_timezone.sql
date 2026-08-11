create or replace function public.set_my_notification_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_timezone text := nullif(btrim(coalesce(p_timezone, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  if v_timezone is null or length(v_timezone) > 100 then
    raise exception 'invalid_timezone' using errcode='P0001';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'invalid_timezone' using errcode='P0001';
  end if;

  insert into public.notification_preferences (user_id, timezone)
  values (v_uid, v_timezone)
  on conflict (user_id) do update
  set timezone = excluded.timezone,
      updated_at = now();
end;
$$;

revoke all on function public.set_my_notification_timezone(text) from public;
grant execute on function public.set_my_notification_timezone(text) to authenticated;
