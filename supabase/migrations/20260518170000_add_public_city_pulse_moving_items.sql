create or replace function public.get_public_city_pulse_moving_items(
  p_match_terms text[],
  p_limit integer default 8
)
returns table (
  item_id uuid,
  open_interest_count bigint,
  latest_interest_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with normalized_terms as (
    select distinct lower(trim(term)) as term
    from unnest(coalesce(p_match_terms, array[]::text[])) as term
    where trim(coalesce(term, '')) <> ''
  ), ranked as (
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
      and exists (
        select 1
        from normalized_terms t
        where
          (
            i.city is not null
            and (
              lower(i.city) like '%' || t.term || '%'
              or t.term like '%' || lower(i.city) || '%'
            )
          )
          or (
            i.area is not null
            and (
              lower(i.area) like '%' || t.term || '%'
              or t.term like '%' || lower(i.area) || '%'
            )
          )
      )
    group by o.requested_item_id
  )
  select
    item_id,
    open_interest_count,
    latest_interest_at
  from ranked
  order by
    open_interest_count desc,
    latest_interest_at desc nulls last
  limit least(greatest(coalesce(p_limit, 8), 1), 16);
$$;

revoke all on function public.get_public_city_pulse_moving_items(text[], integer) from public;
grant execute on function public.get_public_city_pulse_moving_items(text[], integer) to anon, authenticated;
