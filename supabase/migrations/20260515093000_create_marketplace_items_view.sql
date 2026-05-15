create or replace view public.marketplace_items as
select
  i.id,
  i.title,
  i.description,
  img.image_url as cover_image_url,
  c.name_ar as category,
  i.condition::text as item_condition,
  i.city,
  p.display_name as owner_display_name,
  i.created_at
from public.items i
left join public.categories c
  on c.id = i.category_id
left join public.profiles p
  on p.id = i.owner_id
left join lateral (
  select ii.image_url
  from public.item_images ii
  where ii.item_id = i.id
  order by
    ii.is_primary desc,
    ii.sort_order asc,
    ii.created_at asc
  limit 1
) img on true
where
  i.status = 'active'
  and coalesce(p.is_banned, false) = false;
