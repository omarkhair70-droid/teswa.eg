create table if not exists public.badge_definitions (
  key text primary key,
  label_ar text not null,
  description_ar text not null,
  category text not null,
  icon_name text,
  priority integer not null default 100,
  is_active boolean not null default true,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_definitions_key_length check (char_length(key) between 2 and 80),
  constraint badge_definitions_category_check check (category in ('trust', 'early', 'swap', 'community', 'profile', 'special'))
);

insert into public.badge_definitions (key, label_ar, description_ar, category, is_manual)
values
  ('first_swap', 'أول تبديلة', 'كمل أول تجربة تبديل ناجحة على تِسوى.', 'swap', false),
  ('reliable_swapper', 'موثوق في التبديل', 'عنده سجل جيد في التبديل والتواصل.', 'trust', false),
  ('early_swapper', 'من أوائل مستخدمي تِسوى', 'انضم لتِسوى في مرحلة البداية وساهم في بناء المجتمع.', 'early', true),
  ('founder_badge', 'Founder Badge', 'شارة خاصة تُمنح يدويًا للحسابات المؤسسة أو الداعمة للبداية.', 'special', true)
on conflict (key) do update
set
  label_ar = excluded.label_ar,
  description_ar = excluded.description_ar,
  category = excluded.category,
  is_manual = excluded.is_manual,
  updated_at = now();

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null references public.badge_definitions(key) on delete cascade,
  awarded_at timestamptz not null default now(),
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  constraint user_badges_unique_user_badge unique (user_id, badge_key),
  constraint user_badges_source_check check (source in ('system', 'manual', 'admin')),
  constraint user_badges_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists user_badges_user_awarded_idx on public.user_badges (user_id, awarded_at desc);
create index if not exists user_badges_badge_key_idx on public.user_badges (badge_key);
create index if not exists user_badges_awarded_at_idx on public.user_badges (awarded_at desc);

alter table public.badge_definitions enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "badge_definitions_select_active_authenticated" on public.badge_definitions;
create policy "badge_definitions_select_active_authenticated"
on public.badge_definitions
for select
to authenticated
using (is_active = true);

drop policy if exists "user_badges_select_authenticated" on public.user_badges;
create policy "user_badges_select_authenticated"
on public.user_badges
for select
to authenticated
using (true);

create or replace function public.get_user_badges(p_user_id uuid)
returns table (
  badge_key text,
  label_ar text,
  description_ar text,
  category text,
  icon_name text,
  priority integer,
  awarded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
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
$$;

create or replace function public.get_my_badges()
returns table (
  badge_key text,
  label_ar text,
  description_ar text,
  category text,
  icon_name text,
  priority integer,
  awarded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select * from public.get_user_badges(auth.uid());
$$;

create or replace function public.refresh_my_badges()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metrics record;
  v_awarded text[] := array[]::text[];
begin
  select * into v_metrics from public.get_user_trust_metrics(auth.uid()) limit 1;

  if v_metrics is null then
    return jsonb_build_object('awarded_badges', to_jsonb(v_awarded));
  end if;

  if coalesce(v_metrics.completed_deals_count, 0) >= 1 or coalesce(v_metrics.successful_swaps_count, 0) >= 1 then
    insert into public.user_badges (user_id, badge_key, source)
    values (auth.uid(), 'first_swap', 'system')
    on conflict (user_id, badge_key) do nothing;

    if found then
      v_awarded := array_append(v_awarded, 'first_swap');
    end if;
  end if;

  if coalesce(v_metrics.trust_level_key, '') in ('reliable_swapper', 'trusted_swapper') then
    insert into public.user_badges (user_id, badge_key, source)
    values (auth.uid(), 'reliable_swapper', 'system')
    on conflict (user_id, badge_key) do nothing;

    if found then
      v_awarded := array_append(v_awarded, 'reliable_swapper');
    end if;
  end if;

  return jsonb_build_object('awarded_badges', to_jsonb(v_awarded));
end;
$$;

revoke all on function public.get_user_badges(uuid) from public;
revoke all on function public.get_user_badges(uuid) from anon;
grant execute on function public.get_user_badges(uuid) to authenticated;

revoke all on function public.get_my_badges() from public;
revoke all on function public.get_my_badges() from anon;
grant execute on function public.get_my_badges() to authenticated;

revoke all on function public.refresh_my_badges() from public;
revoke all on function public.refresh_my_badges() from anon;
grant execute on function public.refresh_my_badges() to authenticated;
