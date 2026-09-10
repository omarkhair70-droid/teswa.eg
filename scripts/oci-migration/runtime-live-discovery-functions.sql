\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'teswa_app_authenticated') THEN
    RAISE EXCEPTION 'required role teswa_app_authenticated is missing';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_public_moving_items(p_limit integer default 12)
RETURNS TABLE (
  item_id uuid,
  open_interest_count bigint,
  latest_interest_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      o.requested_item_id AS item_id,
      count(*)::bigint AS open_interest_count,
      max(o.created_at) AS latest_interest_at
    FROM public.offers o
    JOIN public.items i
      ON i.id = o.requested_item_id
    LEFT JOIN public.profiles p
      ON p.id = i.owner_id
    WHERE
      o.status::text IN ('pending', 'thinking')
      AND i.status = 'active'::public.item_status
      AND coalesce(p.is_banned, false) = false
    GROUP BY o.requested_item_id
  )
  SELECT
    item_id,
    open_interest_count,
    latest_interest_at
  FROM ranked
  ORDER BY
    open_interest_count DESC,
    latest_interest_at DESC
  LIMIT least(greatest(coalesce(p_limit, 12), 1), 24);
$$;

REVOKE ALL ON FUNCTION public.get_public_moving_items(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_moving_items(integer) TO teswa_app_authenticated;

CREATE OR REPLACE FUNCTION public.get_public_city_pulse_moving_items(
  p_match_terms text[],
  p_limit integer default 8
)
RETURNS TABLE (
  item_id uuid,
  open_interest_count bigint,
  latest_interest_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH normalized_terms AS (
    SELECT DISTINCT lower(trim(term)) AS term
    FROM unnest(coalesce(p_match_terms, array[]::text[])) AS term
    WHERE trim(coalesce(term, '')) <> ''
  ), ranked AS (
    SELECT
      o.requested_item_id AS item_id,
      count(*)::bigint AS open_interest_count,
      max(o.created_at) AS latest_interest_at
    FROM public.offers o
    JOIN public.items i
      ON i.id = o.requested_item_id
    LEFT JOIN public.profiles p
      ON p.id = i.owner_id
    WHERE
      o.status::text IN ('pending', 'thinking')
      AND i.status = 'active'::public.item_status
      AND coalesce(p.is_banned, false) = false
      AND EXISTS (
        SELECT 1
        FROM normalized_terms t
        WHERE
          (
            i.city IS NOT NULL
            AND (
              lower(i.city) LIKE '%' || t.term || '%'
              OR t.term LIKE '%' || lower(i.city) || '%'
            )
          )
          OR (
            i.area IS NOT NULL
            AND (
              lower(i.area) LIKE '%' || t.term || '%'
              OR t.term LIKE '%' || lower(i.area) || '%'
            )
          )
      )
    GROUP BY o.requested_item_id
  )
  SELECT
    item_id,
    open_interest_count,
    latest_interest_at
  FROM ranked
  ORDER BY
    open_interest_count DESC,
    latest_interest_at DESC NULLS LAST
  LIMIT least(greatest(coalesce(p_limit, 8), 1), 16);
$$;

REVOKE ALL ON FUNCTION public.get_public_city_pulse_moving_items(text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_city_pulse_moving_items(text[], integer) TO teswa_app_authenticated;

CREATE OR REPLACE FUNCTION public.get_nearby_marketplace_items(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 3,
  p_limit integer default 50,
  p_offset integer default 0
)
RETURNS TABLE (
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounded AS (
    SELECT greatest(1, least(coalesce(p_limit, 50), 100)) AS page_limit,
           greatest(0, coalesce(p_offset, 0)) AS page_offset,
           greatest(0.1, coalesce(p_radius_km, 3)) AS radius_km
  ), base AS (
    SELECT
      i.id,
      i.title,
      i.description,
      (
        SELECT ii.image_url
        FROM public.item_images ii
        WHERE ii.item_id = i.id
        ORDER BY ii.is_primary DESC, ii.sort_order ASC NULLS LAST, ii.created_at ASC
        LIMIT 1
      ) AS cover_image_url,
      c.name_ar AS category,
      i.condition::text AS item_condition,
      i.city,
      p.display_name AS owner_display_name,
      i.created_at,
      (6371 * acos(
        least(1, greatest(-1,
          cos(radians(p_latitude)) * cos(radians(i.location_latitude)) * cos(radians(i.location_longitude) - radians(p_longitude))
          + sin(radians(p_latitude)) * sin(radians(i.location_latitude))
        ))
      )) AS distance_km
    FROM public.items i
    LEFT JOIN public.categories c ON c.id = i.category_id
    LEFT JOIN public.profiles p ON p.id = i.owner_id
    WHERE i.status = 'active'
      AND i.location_latitude IS NOT NULL
      AND i.location_longitude IS NOT NULL
      AND coalesce(p.is_banned, false) = false
  )
  SELECT b.id, b.title, b.description, b.cover_image_url, b.category, b.item_condition,
         b.city, b.owner_display_name, b.created_at, b.distance_km
  FROM base b
  CROSS JOIN bounded x
  WHERE b.distance_km <= x.radius_km
  ORDER BY b.distance_km ASC, b.created_at DESC
  LIMIT (SELECT page_limit + 1 FROM bounded)
  OFFSET (SELECT page_offset FROM bounded);
$$;

REVOKE ALL ON FUNCTION public.get_nearby_marketplace_items(double precision, double precision, double precision, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_nearby_marketplace_items(double precision, double precision, double precision, integer, integer) TO teswa_app_authenticated;

COMMIT;
