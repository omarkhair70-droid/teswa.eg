-- PR #370 follow-up: ensure offer_events exists and harden accept_offer server-side.

create table if not exists public.offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  old_status text null,
  new_status text null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists offer_events_offer_id_idx on public.offer_events (offer_id);
create index if not exists offer_events_actor_id_idx on public.offer_events (actor_id);

alter table public.offer_events enable row level security;

-- Read-only visibility for participants of the related offer.
drop policy if exists offer_events_participant_select on public.offer_events;
create policy offer_events_participant_select
on public.offer_events
for select
to authenticated
using (
  exists (
    select 1
    from public.offers o
    where o.id = offer_events.offer_id
      and auth.uid() in (o.sender_id, o.receiver_id)
  )
);

-- No direct insert/update/delete policies are granted; writes are via SECURITY DEFINER RPCs only.

create or replace function public.accept_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.offers%rowtype;
  v_existing_deal public.swap_deals%rowtype;
  v_deal_id uuid;
begin
  select * into v_offer
  from public.offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;

  if auth.uid() is null or auth.uid() <> v_offer.receiver_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_offer.status not in ('pending', 'thinking', 'accepted') then
    raise exception 'invalid_offer_transition' using errcode = 'P0001';
  end if;

  select * into v_existing_deal
  from public.swap_deals
  where offer_id = v_offer.id
  order by created_at asc
  limit 1
  for update;

  if found then
    if v_offer.status <> 'accepted' then
      update public.offers
      set status = 'accepted',
          updated_at = now()
      where id = v_offer.id;
    end if;

    return v_existing_deal.id;
  end if;

  if v_offer.status = 'accepted' then
    raise exception 'accepted_offer_missing_deal' using errcode = 'P0001';
  end if;

  insert into public.swap_deals (
    offer_id,
    requested_item_id,
    offered_item_id,
    requester_id,
    offerer_id,
    status,
    accepted_at,
    created_at,
    updated_at
  )
  values (
    v_offer.id,
    v_offer.requested_item_id,
    v_offer.offered_item_id,
    v_offer.receiver_id,
    v_offer.sender_id,
    'coordinating',
    now(),
    now(),
    now()
  )
  returning id into v_deal_id;

  update public.offers
  set status = 'accepted',
      updated_at = now()
  where id = v_offer.id;

  return v_deal_id;
end;
$$;
