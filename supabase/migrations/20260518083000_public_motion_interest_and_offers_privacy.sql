drop policy if exists offers_public_select on public.offers;

create policy offers_participant_select
on public.offers
for select
to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
);

create or replace function public.get_public_moving_items(p_limit integer default 12)
returns table (
  item_id uuid,
  open_interest_count bigint,
  latest_interest_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      o.requested_item_id as item_id,
      count(*)::bigint as open_interest_count,
      max(o.created_at) as latest_interest_at
    from public.offers o
    join public.items i
      on i.id = o.requested_item_id
    left join public.profiles p
      on p.id = i.owner_id
    where
      o.status::text in ('pending', 'thinking')
      and i.status = 'active'::public.item_status
      and coalesce(p.is_banned, false) = false
    group by o.requested_item_id
  )
  select
    item_id,
    open_interest_count,
    latest_interest_at
  from ranked
  order by
    open_interest_count desc,
    latest_interest_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 24);
$$;

revoke all on function public.get_public_moving_items(integer) from public;
grant execute on function public.get_public_moving_items(integer) to anon, authenticated;

create index if not exists idx_offers_motion_interest
on public.offers (requested_item_id, status, created_at desc);
