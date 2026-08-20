drop policy if exists offers_participant_lifecycle_update on public.offers;
drop policy if exists deals_participant_lifecycle_update on public.swap_deals;
drop policy if exists deals_receiver_insert_after_accept on public.swap_deals;
drop policy if exists offer_events_public_select on public.offer_events;
drop policy if exists offer_events_participant_insert on public.offer_events;

drop policy if exists offers_sender_insert on public.offers;
create policy offers_sender_insert
on public.offers
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and status::text = 'pending'
  and requested_item_id <> offered_item_id
  and exists (
    select 1 from public.items requested
    where requested.id = offers.requested_item_id
      and requested.owner_id = offers.receiver_id
      and requested.owner_id <> (select auth.uid())
      and requested.status::text = 'active'
  )
  and exists (
    select 1 from public.items offered
    where offered.id = offers.offered_item_id
      and offered.owner_id = (select auth.uid())
      and offered.status::text = 'active'
  )
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_user_id = offers.receiver_id)
       or (b.blocker_id = offers.receiver_id and b.blocked_user_id = (select auth.uid()))
  )
);

create or replace function public.log_offer_created_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.offer_events (offer_id, actor_id, event_type, old_status, new_status, note)
  values (new.id, new.sender_id, 'created', null, 'pending', null);
  return new;
end;
$$;

revoke all on function public.log_offer_created_event() from public, anon, authenticated;
grant execute on function public.log_offer_created_event() to service_role;

drop trigger if exists offers_log_created_event on public.offers;
create trigger offers_log_created_event
after insert on public.offers
for each row execute function public.log_offer_created_event();
