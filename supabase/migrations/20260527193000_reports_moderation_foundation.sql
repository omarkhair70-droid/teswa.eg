-- Sprint 4: Reports + Moderation foundation

alter table public.reports
  add column if not exists reported_item_id uuid null references public.items(id) on delete set null,
  add column if not exists reported_offer_id uuid null references public.offers(id) on delete set null,
  add column if not exists reported_deal_id uuid null references public.swap_deals(id) on delete set null,
  add column if not exists reported_direct_conversation_id uuid null references public.direct_conversations(id) on delete set null,
  add column if not exists reported_stream_message_id text null,
  add column if not exists reported_deal_message_id uuid null references public.deal_messages(id) on delete set null,
  add column if not exists action_taken text null,
  add column if not exists admin_notes text null,
  add column if not exists reviewed_by uuid null references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists status text not null default 'open';

-- Ensure story compatibility exists for target-required checks.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='stories'
  ) then
    alter table public.reports
      add column if not exists story_id uuid null references public.stories(id) on delete set null;
  else
    alter table public.reports
      add column if not exists story_id uuid null;
  end if;
end $$;

-- Backward-compatible aliases for legacy columns, only when each legacy column exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='item_id'
  ) then
    update public.reports
    set reported_item_id = coalesce(reported_item_id, item_id)
    where reported_item_id is null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='offer_id'
  ) then
    update public.reports
    set reported_offer_id = coalesce(reported_offer_id, offer_id)
    where reported_offer_id is null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='deal_id'
  ) then
    update public.reports
    set reported_deal_id = coalesce(reported_deal_id, deal_id)
    where reported_deal_id is null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='deal_message_id'
  ) then
    update public.reports
    set reported_deal_message_id = coalesce(reported_deal_message_id, deal_message_id)
    where reported_deal_message_id is null;
  end if;
end $$;

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check check (status in ('open','reviewing','actioned','dismissed'));

alter table public.reports drop constraint if exists reports_target_required_check;
alter table public.reports add constraint reports_target_required_check check (
  reported_user_id is not null
  or reported_item_id is not null
  or reported_offer_id is not null
  or reported_deal_id is not null
  or reported_direct_conversation_id is not null
  or reported_stream_message_id is not null
  or reported_deal_message_id is not null
  or story_id is not null
);

create index if not exists reports_reported_item_id_idx on public.reports(reported_item_id);
create index if not exists reports_reported_offer_id_idx on public.reports(reported_offer_id);
create index if not exists reports_reported_deal_id_idx on public.reports(reported_deal_id);
create index if not exists reports_reported_direct_conversation_id_idx on public.reports(reported_direct_conversation_id);
create index if not exists reports_reported_deal_message_id_idx on public.reports(reported_deal_message_id);
create index if not exists reports_status_created_idx on public.reports(status, created_at desc);

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user','admin','moderator'));

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='profiles' and c.column_name='role'
  )
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','moderator')
  );
$$;

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
for select to authenticated
using (reporter_id = auth.uid() or public.is_admin_user());

drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports
for update to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create or replace function public.enforce_reports_rate_limit(p_reporter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.reports r
  where r.reporter_id = p_reporter_id and r.created_at >= now() - interval '1 hour';
  if v_count >= 5 then
    raise exception 'reports_rate_limited' using errcode='P0001';
  end if;
end;
$$;

create or replace function public.report_user(p_reported_user_id uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_reported_user_id is null or p_reported_user_id = v_uid then raise exception 'invalid_target' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reason, details, status)
  values (v_uid, p_reported_user_id, trim(p_reason), nullif(trim(coalesce(p_details,'')),''), 'open');
end; $$;

create or replace function public.report_item(p_item_id uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select i.owner_id into v_owner from public.items i where i.id = p_item_id;
  if v_owner is null then raise exception 'item_not_found' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_item_id, reason, details, status)
  values (v_uid, v_owner, p_item_id, trim(p_reason), nullif(trim(coalesce(p_details,'')),''), 'open');
end; $$;

create or replace function public.report_deal(p_deal_id uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_deal public.swap_deals%rowtype; v_reported_user_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_deal from public.swap_deals where id = p_deal_id;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_deal.requester_id, v_deal.offerer_id) then raise exception 'not_participant' using errcode='42501'; end if;
  v_reported_user_id := case when v_deal.requester_id = v_uid then v_deal.offerer_id else v_deal.requester_id end;
  if v_reported_user_id is null or v_reported_user_id = v_uid then raise exception 'invalid_target' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_deal_id, reason, details, status)
  values (v_uid, v_reported_user_id, p_deal_id, trim(p_reason), nullif(trim(coalesce(p_details,'')),''), 'open');
end; $$;

create or replace function public.report_story(p_story_id uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_author_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select s.user_id into v_author_id from public.stories s where s.id = p_story_id;
  if v_author_id is null then raise exception 'story_not_found' using errcode='P0001'; end if;
  if v_author_id = v_uid then raise exception 'cannot_report_own_story' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, story_id, reason, details, status)
  values (v_uid, v_author_id, p_story_id, trim(p_reason), nullif(trim(coalesce(p_details,'')),''), 'open');
end; $$;

create or replace function public.report_direct_message(p_conversation_id uuid, p_stream_message_id text, p_reported_user_id uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_convo public.direct_conversations%rowtype; v_other uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_convo from public.direct_conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_convo.participant_a, v_convo.participant_b) then raise exception 'not_participant' using errcode='42501'; end if;
  v_other := case when v_convo.participant_a = v_uid then v_convo.participant_b else v_convo.participant_a end;
  if p_reported_user_id is distinct from v_other then raise exception 'invalid_reported_user' using errcode='P0001'; end if;
  if length(trim(coalesce(p_stream_message_id,''))) = 0 then raise exception 'invalid_message' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_direct_conversation_id, reported_stream_message_id, reason, details, status)
  values (v_uid, v_other, p_conversation_id, trim(p_stream_message_id), trim(p_reason), nullif(trim(coalesce(p_details,'')),''), 'open');
end; $$;

create or replace function public.report_deal_message(p_deal_id uuid, p_deal_message_id uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_deal public.swap_deals%rowtype; v_sender uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select * into v_deal from public.swap_deals where id = p_deal_id;
  if not found then raise exception 'deal_not_found' using errcode='P0001'; end if;
  if v_uid not in (v_deal.requester_id, v_deal.offerer_id) then raise exception 'not_participant' using errcode='42501'; end if;
  select dm.sender_id into v_sender from public.deal_messages dm where dm.id = p_deal_message_id and dm.deal_id = p_deal_id;
  if v_sender is null then raise exception 'deal_message_not_found' using errcode='P0001'; end if;
  if v_sender = v_uid then raise exception 'cannot_report_own_message' using errcode='P0001'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 or length(trim(p_reason)) > 500 then raise exception 'invalid_reason' using errcode='P0001'; end if;
  perform public.enforce_reports_rate_limit(v_uid);
  insert into public.reports (reporter_id, reported_user_id, reported_deal_id, reported_deal_message_id, reason, details, status)
  values (v_uid, v_sender, p_deal_id, p_deal_message_id, trim(p_reason), nullif(trim(coalesce(p_details,'')),''), 'open');
end; $$;

create or replace function public.review_report(p_report_id uuid, p_status text, p_action_taken text default null, p_admin_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin_user() then raise exception 'not_allowed' using errcode='42501'; end if;
  if p_status not in ('reviewing','actioned','dismissed') then raise exception 'invalid_status' using errcode='P0001'; end if;
  update public.reports
  set status = p_status,
      action_taken = nullif(trim(coalesce(p_action_taken,'')),''),
      admin_notes = nullif(trim(coalesce(p_admin_notes,'')),''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_report_id;
  if not found then raise exception 'report_not_found' using errcode='P0001'; end if;
end; $$;

create or replace function public.hide_item_for_moderation(p_item_id uuid, p_report_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_target_status text := 'archived';
begin
  if auth.role() <> 'service_role' and not public.is_admin_user() then raise exception 'not_allowed' using errcode='42501'; end if;

  if exists (
    select 1
    from pg_attribute a
    join pg_class t on t.oid = a.attrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_type typ on typ.oid = a.atttypid
    join pg_enum e on e.enumtypid = typ.oid
    where n.nspname='public'
      and t.relname='items'
      and a.attname='status'
      and e.enumlabel='hidden'
  ) or exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname='public'
      and t.relname='items'
      and pg_get_constraintdef(c.oid) ilike '%status%hidden%'
  ) then
    v_target_status := 'hidden';
  end if;

  execute 'update public.items set status = ' || quote_literal(v_target_status) || ', updated_at = now() where id = $1 and status::text = ''active'''
  using p_item_id;
  if not found then raise exception 'item_not_mutable' using errcode='P0001'; end if;
  if p_report_id is not null then
    perform public.review_report(p_report_id, 'actioned', 'item_hidden', 'Item hidden for moderation.');
  end if;
end; $$;

grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.report_user(uuid,text,text) to authenticated;
grant execute on function public.report_item(uuid,text,text) to authenticated;
grant execute on function public.report_deal(uuid,text,text) to authenticated;
grant execute on function public.report_story(uuid,text,text) to authenticated;
grant execute on function public.report_direct_message(uuid,text,uuid,text,text) to authenticated;
grant execute on function public.report_deal_message(uuid,uuid,text,text) to authenticated;
grant execute on function public.review_report(uuid,text,text,text) to authenticated;
grant execute on function public.hide_item_for_moderation(uuid,uuid) to authenticated;
