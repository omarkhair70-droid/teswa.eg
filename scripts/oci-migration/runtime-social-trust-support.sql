\set ON_ERROR_STOP on

-- Teswa Lane 4 social/trust support helpers required by the user-facing RPC batch.
-- Canonical production definitions captured 2026-09-06.
-- These helpers do not depend on Supabase auth.uid().
BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id uuid)
RETURNS TABLE(
  badge_key text,
  label_ar text,
  description_ar text,
  category text,
  icon_name text,
  priority integer,
  awarded_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    ub.badge_key,
    bd.label_ar,
    bd.description_ar,
    bd.category,
    bd.icon_name,
    bd.priority,
    ub.awarded_at
  from public.user_badges ub
  join public.badge_definitions bd on bd.key = ub.badge_key
  where ub.user_id = p_user_id
    and bd.is_active = true
  order by bd.priority asc, ub.awarded_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_trust_metrics(p_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  successful_swaps_count integer,
  completed_deals_count integer,
  cancelled_deals_count integer,
  total_reviews_received integer,
  average_rating numeric,
  clear_description_count integer,
  good_communication_count integer,
  on_time_count integer,
  respectful_swapper_count integer,
  response_rate numeric,
  avg_response_time_minutes numeric,
  trust_level_key text,
  trust_score integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_exists boolean;
begin
  if p_user_id is null then
    return;
  end if;

  select exists(select 1 from public.profiles p where p.id = p_user_id) into v_exists;
  if not v_exists then
    return;
  end if;

  return query
  with deal_stats as (
    select
      count(*) filter (where d.status = 'completed')::integer as completed_deals_count,
      count(*) filter (where d.status = 'cancelled')::integer as cancelled_deals_count
    from public.swap_deals d
    where d.requester_id = p_user_id or d.offerer_id = p_user_id
  ),
  review_stats as (
    select
      count(*)::integer as total_reviews_received,
      round(avg(r.rating)::numeric, 2) as average_rating,
      count(*) filter (where r.clear_description is true)::integer as clear_description_count,
      count(*) filter (where r.good_communication is true)::integer as good_communication_count,
      count(*) filter (where r.on_time is true)::integer as on_time_count,
      count(*) filter (where r.respectful_swapper is true)::integer as respectful_swapper_count
    from public.reviews r
    where r.reviewee_id = p_user_id
  ),
  response_stats as (
    select
      round(avg(extract(epoch from (first_reply_at - first_incoming_at)) / 60.0)::numeric, 2) as avg_response_time_minutes
    from (
      select
        incoming.deal_id,
        incoming.first_incoming_at,
        (
          select min(dm2.created_at)
          from public.deal_messages dm2
          where dm2.deal_id = incoming.deal_id
            and dm2.sender_id = p_user_id
            and dm2.created_at > incoming.first_incoming_at
        ) as first_reply_at
      from (
        select dm.deal_id, min(dm.created_at) as first_incoming_at
        from public.deal_messages dm
        where dm.sender_id <> p_user_id
          and exists (
            select 1
            from public.swap_deals sd
            where sd.id = dm.deal_id
              and (sd.requester_id = p_user_id or sd.offerer_id = p_user_id)
          )
        group by dm.deal_id
      ) incoming
    ) reply_pairs
    where first_reply_at is not null
  ),
  base as (
    select
      p.id as user_id,
      coalesce(p.successful_swaps_count, 0)::integer as successful_swaps_count,
      coalesce(d.completed_deals_count, 0)::integer as completed_deals_count,
      coalesce(d.cancelled_deals_count, 0)::integer as cancelled_deals_count,
      coalesce(r.total_reviews_received, 0)::integer as total_reviews_received,
      r.average_rating,
      coalesce(r.clear_description_count, 0)::integer as clear_description_count,
      coalesce(r.good_communication_count, 0)::integer as good_communication_count,
      coalesce(r.on_time_count, 0)::integer as on_time_count,
      coalesce(r.respectful_swapper_count, 0)::integer as respectful_swapper_count,
      coalesce(p.response_rate, 0)::numeric(5,2) as response_rate,
      rs.avg_response_time_minutes
    from public.profiles p
    cross join deal_stats d
    cross join review_stats r
    cross join response_stats rs
    where p.id = p_user_id
  ),
  scored as (
    select
      b.*,
      (
        least(40, b.completed_deals_count * 8)
        + least(25, greatest(0, (coalesce(b.average_rating, 0) - 3.0) * 12.5)::integer)
        + least(15, b.good_communication_count * 2)
        + least(10, b.on_time_count * 2)
        + least(10, b.respectful_swapper_count * 2)
        + case when b.response_rate >= 85 then 8 when b.response_rate >= 70 then 4 else 0 end
        + case when b.cancelled_deals_count >= 3 then -10 when b.cancelled_deals_count >= 1 then -3 else 0 end
      )::integer as trust_score
    from base b
  )
  select
    s.user_id,
    s.successful_swaps_count,
    s.completed_deals_count,
    s.cancelled_deals_count,
    s.total_reviews_received,
    s.average_rating,
    s.clear_description_count,
    s.good_communication_count,
    s.on_time_count,
    s.respectful_swapper_count,
    s.response_rate,
    s.avg_response_time_minutes,
    case
      when s.completed_deals_count = 0 and s.total_reviews_received = 0 then 'new_swapper'
      when s.completed_deals_count >= 8 and coalesce(s.average_rating, 0) >= 4.6 and s.response_rate >= 80 then 'trusted_swapper'
      when s.completed_deals_count >= 4 and coalesce(s.average_rating, 0) >= 4.2 and s.response_rate >= 65 then 'reliable_swapper'
      when s.completed_deals_count >= 1 or (s.total_reviews_received >= 2 and coalesce(s.average_rating, 0) >= 4.0) then 'rising_swapper'
      else 'new_swapper'
    end as trust_level_key,
    greatest(0, least(100, s.trust_score))::integer as trust_score
  from scored s;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_reports_rate_limit(p_reporter_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
  select count(*) into v_count
  from public.reports r
  where r.reporter_id = p_reporter_id
    and r.created_at >= now() - interval '1 hour';
  if v_count >= 5 then
    raise exception 'reports_rate_limited' using errcode='P0001';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.get_user_badges(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_trust_metrics(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_reports_rate_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_badges(uuid) TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_trust_metrics(uuid) TO teswa_app_authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_reports_rate_limit(uuid) TO teswa_app_authenticated;

COMMIT;
