alter table public.items
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision;

alter table public.items
  drop constraint if exists items_location_latitude_range,
  add constraint items_location_latitude_range check (location_latitude is null or (location_latitude >= -90 and location_latitude <= 90));

alter table public.items
  drop constraint if exists items_location_longitude_range,
  add constraint items_location_longitude_range check (location_longitude is null or (location_longitude >= -180 and location_longitude <= 180));

create index if not exists items_active_precise_location_idx
  on public.items (status, created_at desc)
  where location_latitude is not null and location_longitude is not null;

create or replace function public.get_nearby_marketplace_items(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 3,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  description text,
  cover_image_url text,
  category text,
  item_condition text,
  city text,
  owner_display_name text,
  created_at timestamptz,
  distance_km double precision
)
language sql
security definer
set search_path = public
as $$
  with bounded as (
    select greatest(1, least(coalesce(p_limit, 50), 100)) as page_limit,
           greatest(0, coalesce(p_offset, 0)) as page_offset,
           greatest(0.1, coalesce(p_radius_km, 3)) as radius_km
  ), base as (
    select
      i.id,
      i.title,
      i.description,
      (
        select ii.image_url
        from public.item_images ii
        where ii.item_id = i.id
        order by ii.is_primary desc, ii.sort_order asc nulls last, ii.created_at asc
        limit 1
      ) as cover_image_url,
      c.name_ar as category,
      i.condition::text as item_condition,
      i.city,
      p.display_name as owner_display_name,
      i.created_at,
      (6371 * acos(
        least(1, greatest(-1,
          cos(radians(p_latitude)) * cos(radians(i.location_latitude)) * cos(radians(i.location_longitude) - radians(p_longitude))
          + sin(radians(p_latitude)) * sin(radians(i.location_latitude))
        ))
      )) as distance_km
    from public.items i
    left join public.categories c on c.id = i.category_id
    left join public.profiles p on p.id = i.owner_id
    where i.status = 'active'
      and i.location_latitude is not null
      and i.location_longitude is not null
      and coalesce(p.is_banned, false) = false
  )
  select b.id, b.title, b.description, b.cover_image_url, b.category, b.item_condition, b.city, b.owner_display_name, b.created_at, b.distance_km
  from base b
  cross join bounded x
  where b.distance_km <= x.radius_km
  order by b.distance_km asc, b.created_at desc
  limit (select page_limit + 1 from bounded)
  offset (select page_offset from bounded);
$$;

revoke all on function public.get_nearby_marketplace_items(double precision, double precision, double precision, integer, integer) from public;
grant execute on function public.get_nearby_marketplace_items(double precision, double precision, double precision, integer, integer) to authenticated;
