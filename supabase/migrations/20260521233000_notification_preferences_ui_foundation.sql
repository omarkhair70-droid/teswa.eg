-- Extend existing notification preferences with user-facing category controls.
alter table if exists public.notification_preferences
  add column if not exists offers_enabled boolean not null default true,
  add column if not exists deals_enabled boolean not null default true,
  add column if not exists messages_enabled boolean not null default true,
  add column if not exists social_enabled boolean not null default true,
  add column if not exists smart_reminders_enabled boolean not null default true,
  add column if not exists marketing_enabled boolean not null default false,
  add column if not exists quiet_hours_enabled boolean not null default false;

alter table if exists public.notification_preferences
  drop constraint if exists notification_preferences_quiet_hours_start_check,
  drop constraint if exists notification_preferences_quiet_hours_end_check;

alter table if exists public.notification_preferences
  alter column quiet_hours_start type text using (
    case
      when quiet_hours_start is null then '23:00'
      else lpad((quiet_hours_start / 60)::text, 2, '0') || ':' || lpad((quiet_hours_start % 60)::text, 2, '0')
    end
  ),
  alter column quiet_hours_start set default '23:00',
  alter column quiet_hours_start set not null,
  alter column quiet_hours_end type text using (
    case
      when quiet_hours_end is null then '08:00'
      else lpad((quiet_hours_end / 60)::text, 2, '0') || ':' || lpad((quiet_hours_end % 60)::text, 2, '0')
    end
  ),
  alter column quiet_hours_end set default '08:00',
  alter column quiet_hours_end set not null;

alter table if exists public.notification_preferences
  add constraint notification_preferences_quiet_hours_start_check check (quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint notification_preferences_quiet_hours_end_check check (quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create or replace function public.get_my_notification_preferences()
returns table (
  offers_enabled boolean,
  deals_enabled boolean,
  messages_enabled boolean,
  social_enabled boolean,
  smart_reminders_enabled boolean,
  marketing_enabled boolean,
  quiet_hours_enabled boolean,
  quiet_hours_start text,
  quiet_hours_end text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.notification_preferences (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  return query
  select p.offers_enabled, p.deals_enabled, p.messages_enabled, p.social_enabled,
         p.smart_reminders_enabled, p.marketing_enabled, p.quiet_hours_enabled,
         p.quiet_hours_start, p.quiet_hours_end, p.updated_at
  from public.notification_preferences p
  where p.user_id = v_uid;
end;
$$;

create or replace function public.update_my_notification_preferences(
  p_offers_enabled boolean default null,
  p_deals_enabled boolean default null,
  p_messages_enabled boolean default null,
  p_social_enabled boolean default null,
  p_smart_reminders_enabled boolean default null,
  p_marketing_enabled boolean default null,
  p_quiet_hours_enabled boolean default null,
  p_quiet_hours_start text default null,
  p_quiet_hours_end text default null
)
returns table (
  offers_enabled boolean,
  deals_enabled boolean,
  messages_enabled boolean,
  social_enabled boolean,
  smart_reminders_enabled boolean,
  marketing_enabled boolean,
  quiet_hours_enabled boolean,
  quiet_hours_start text,
  quiet_hours_end text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_quiet_hours_start is not null and p_quiet_hours_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid_quiet_hours_start';
  end if;
  if p_quiet_hours_end is not null and p_quiet_hours_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'invalid_quiet_hours_end';
  end if;

  insert into public.notification_preferences as p (
    user_id, offers_enabled, deals_enabled, messages_enabled, social_enabled,
    smart_reminders_enabled, marketing_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end
  )
  values (
    v_uid,
    coalesce(p_offers_enabled, true),
    coalesce(p_deals_enabled, true),
    coalesce(p_messages_enabled, true),
    coalesce(p_social_enabled, true),
    coalesce(p_smart_reminders_enabled, true),
    coalesce(p_marketing_enabled, false),
    coalesce(p_quiet_hours_enabled, false),
    coalesce(p_quiet_hours_start, '23:00'),
    coalesce(p_quiet_hours_end, '08:00')
  )
  on conflict (user_id) do update set
    offers_enabled = coalesce(p_offers_enabled, p.offers_enabled),
    deals_enabled = coalesce(p_deals_enabled, p.deals_enabled),
    messages_enabled = coalesce(p_messages_enabled, p.messages_enabled),
    social_enabled = coalesce(p_social_enabled, p.social_enabled),
    smart_reminders_enabled = coalesce(p_smart_reminders_enabled, p.smart_reminders_enabled),
    marketing_enabled = coalesce(p_marketing_enabled, p.marketing_enabled),
    quiet_hours_enabled = coalesce(p_quiet_hours_enabled, p.quiet_hours_enabled),
    quiet_hours_start = coalesce(p_quiet_hours_start, p.quiet_hours_start),
    quiet_hours_end = coalesce(p_quiet_hours_end, p.quiet_hours_end);

  return query
  select p.offers_enabled, p.deals_enabled, p.messages_enabled, p.social_enabled,
         p.smart_reminders_enabled, p.marketing_enabled, p.quiet_hours_enabled,
         p.quiet_hours_start, p.quiet_hours_end, p.updated_at
  from public.notification_preferences p
  where p.user_id = v_uid;
end;
$$;

revoke all on function public.get_my_notification_preferences() from public;
revoke all on function public.get_my_notification_preferences() from anon;
revoke all on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text) from public;
revoke all on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text) from anon;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text) to authenticated;
