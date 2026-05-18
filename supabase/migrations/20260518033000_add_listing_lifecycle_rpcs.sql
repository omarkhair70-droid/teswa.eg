create or replace function public.archive_owned_listing_if_safe(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.item_status;
begin
  select i.status
  into v_status
  from public.items i
  where i.id = p_item_id
    and i.owner_id = auth.uid();

  if v_status is null then
    return 'not_found_or_unauthorized';
  end if;

  if v_status <> 'active'::public.item_status then
    return 'not_active';
  end if;

  if exists (
    select 1
    from public.offers o
    where (o.requested_item_id = p_item_id or o.offered_item_id = p_item_id)
      and o.status::text in ('pending', 'thinking')
  ) then
    return 'has_open_offers';
  end if;

  update public.items
  set status = 'archived'::public.item_status
  where id = p_item_id
    and owner_id = auth.uid();

  return 'archived';
end;
$$;

revoke all on function public.archive_owned_listing_if_safe(uuid) from public;
grant execute on function public.archive_owned_listing_if_safe(uuid) to authenticated;

create or replace function public.reactivate_owned_archived_listing(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.item_status;
begin
  select i.status
  into v_status
  from public.items i
  where i.id = p_item_id
    and i.owner_id = auth.uid();

  if v_status is null then
    return 'not_found_or_unauthorized';
  end if;

  if v_status <> 'archived'::public.item_status then
    return 'not_archived';
  end if;

  update public.items
  set status = 'active'::public.item_status
  where id = p_item_id
    and owner_id = auth.uid();

  return 'reactivated';
end;
$$;

revoke all on function public.reactivate_owned_archived_listing(uuid) from public;
grant execute on function public.reactivate_owned_archived_listing(uuid) to authenticated;

create or replace function public.delete_owned_archived_listing_if_safe(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.item_status;
begin
  select i.status
  into v_status
  from public.items i
  where i.id = p_item_id
    and i.owner_id = auth.uid();

  if v_status is null then
    return 'not_found_or_unauthorized';
  end if;

  if v_status <> 'archived'::public.item_status then
    return 'not_archived';
  end if;

  if exists (
    select 1
    from public.offers o
    where (o.requested_item_id = p_item_id or o.offered_item_id = p_item_id)
      and o.status::text in ('pending', 'thinking')
  ) then
    return 'has_open_offers';
  end if;

  if exists (
    select 1
    from public.swap_deals sd
    where sd.requested_item_id = p_item_id
       or sd.offered_item_id = p_item_id
  ) then
    return 'has_deal_history';
  end if;

  delete from public.items
  where id = p_item_id
    and owner_id = auth.uid();

  return 'deleted';
end;
$$;

revoke all on function public.delete_owned_archived_listing_if_safe(uuid) from public;
grant execute on function public.delete_owned_archived_listing_if_safe(uuid) to authenticated;
