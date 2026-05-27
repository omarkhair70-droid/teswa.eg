-- Sprint 3: Offers/Deals state machine hardening.
-- Current known offer statuses in app usage: pending, thinking, accepted, soft_rejected, redirected, withdrawn, expired, cancelled_after_accept.
-- Current known deal statuses in app usage: coordinating, completed_pending_confirmation, completed, cancelled, disputed.

create or replace function public.mark_offer_thinking(p_offer_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.offers%rowtype;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  if auth.uid() is null or auth.uid() <> v_offer.receiver_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_offer.status not in ('pending','thinking') then
    raise exception 'invalid_offer_transition' using errcode = 'P0001';
  end if;
  update public.offers set status='thinking', updated_at=now() where id = p_offer_id;
  insert into public.offer_events (offer_id, actor_id, event_type, old_status, new_status, note)
  values (p_offer_id, auth.uid(), 'marked_thinking', v_offer.status, 'thinking', nullif(trim(coalesce(p_note,'')),''));
end;
$$;

create or replace function public.soft_reject_offer(p_offer_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_offer public.offers%rowtype;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then raise exception 'offer_not_found' using errcode='P0001'; end if;
  if auth.uid() is null or auth.uid() <> v_offer.receiver_id then raise exception 'not_allowed' using errcode='42501'; end if;
  if v_offer.status not in ('pending','thinking') then raise exception 'invalid_offer_transition' using errcode='P0001'; end if;
  update public.offers set status='soft_rejected', updated_at=now() where id=p_offer_id;
  insert into public.offer_events (offer_id, actor_id, event_type, old_status, new_status, note)
  values (p_offer_id, auth.uid(), 'soft_rejected', v_offer.status, 'soft_rejected', nullif(trim(coalesce(p_note,'')),''));
end;
$$;

create or replace function public.complete_deal_if_ready(p_deal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.swap_deals%rowtype;
  v_count integer;
begin
  select * into v_deal from public.swap_deals where id = p_deal_id for update;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if auth.uid() is null or auth.uid() not in (v_deal.requester_id, v_deal.offerer_id) then raise exception 'not_allowed' using errcode='42501'; end if;
  if v_deal.status in ('completed','cancelled','disputed') then return v_deal.status='completed'; end if;
  if v_deal.status not in ('coordinating','completed_pending_confirmation') then raise exception 'invalid_deal_transition' using errcode='P0001'; end if;

  select count(distinct user_id) into v_count from public.deal_confirmations
  where deal_id = p_deal_id and user_id in (v_deal.requester_id, v_deal.offerer_id);

  if v_count >= 2 then
    update public.swap_deals set status='completed', completed_at=coalesce(completed_at, now()), updated_at=now() where id=p_deal_id;
    return true;
  end if;

  if v_deal.status='coordinating' then
    update public.swap_deals set status='completed_pending_confirmation', updated_at=now() where id=p_deal_id;
  end if;
  return false;
end;
$$;
