create or replace function public.reserve_smart_notification_dispatch(
  p_user_id uuid,
  p_notification_type text,
  p_preference_category text,
  p_dedupe_key text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(id uuid)
language sql
security definer
set search_path = public
as $$
  insert into public.smart_notification_dispatches as d (
    user_id,
    notification_type,
    preference_category,
    entity_type,
    entity_id,
    dedupe_key,
    metadata,
    status
  )
  values (
    p_user_id,
    p_notification_type,
    p_preference_category,
    p_entity_type,
    p_entity_id,
    p_dedupe_key,
    coalesce(p_metadata, '{}'::jsonb),
    'reserved'
  )
  on conflict (dedupe_key) do nothing
  returning d.id;
$$;

revoke all on function public.reserve_smart_notification_dispatch(uuid,text,text,text,text,uuid,jsonb) from public;
grant execute on function public.reserve_smart_notification_dispatch(uuid,text,text,text,text,uuid,jsonb) to service_role;
