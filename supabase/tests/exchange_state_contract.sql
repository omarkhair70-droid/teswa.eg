-- Read-only regression contract for offer/deal lifecycle ownership.
do $$
declare
  def text;
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='offer_events' and policyname='offer_events_public_select'
  ) then
    raise exception 'offer_events must not be public';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='offer_events' and cmd='INSERT'
  ) then
    raise exception 'offer_events must be trigger/RPC written only';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='offers' and cmd='UPDATE'
  ) then
    raise exception 'offers direct UPDATE must remain disabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='swap_deals' and cmd in ('INSERT','UPDATE')
  ) then
    raise exception 'swap_deals direct lifecycle writes must remain disabled';
  end if;

  if not exists (
    select 1 from pg_trigger where tgname='offers_log_created_event' and not tgisinternal
  ) then
    raise exception 'offer creation audit trigger missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='offers'
      and policyname='offers_sender_insert'
      and cmd='INSERT'
      and with_check like '%status%pending%'
      and with_check like '%requested_item_id%'
      and with_check like '%offered_item_id%'
      and with_check like '%user_blocks%'
  ) then
    raise exception 'offers insert policy lost server-side ownership/status/block checks';
  end if;

  select pg_get_functiondef('public.accept_offer(uuid)'::regprocedure) into def;
  if position('auth.uid()' in def)=0 or position('for update' in lower(def))=0 then
    raise exception 'accept_offer lost authorization/locking contract';
  end if;

  select pg_get_functiondef('public.complete_deal_if_ready(uuid)'::regprocedure) into def;
  if position('auth.uid()' in def)=0 or position('deal_confirmations' in def)=0 then
    raise exception 'complete_deal_if_ready lost participant confirmation contract';
  end if;
end
$$;

select 'exchange_contract_ok' as result;
