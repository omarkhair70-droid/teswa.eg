alter table public.notifications
  add column if not exists actor_user_id uuid null references auth.users(id) on delete set null;

create index if not exists notifications_actor_user_id_idx on public.notifications(actor_user_id);

create or replace function public.follow_user(p_followed_user_id uuid)
returns table (ok boolean, code text, message text)
language plpgsql security definer set search_path = public as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return query select false, 'unauthorized', 'يجب تسجيل الدخول أولاً.'; return; end if;
  if p_followed_user_id is null then return query select false, 'invalid_target', 'تعذر تحديد المستخدم المطلوب.'; return; end if;
  if v_user_id = p_followed_user_id then return query select false, 'self_follow', 'لا يمكن متابعة نفسك.'; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=p_followed_user_id) or (b.blocker_id=p_followed_user_id and b.blocked_user_id=v_user_id)) then
    return query select false, 'blocked', 'لا يمكن تنفيذ المتابعة بسبب إعدادات الحظر.'; return;
  end if;

  insert into public.user_follows (follower_id, followed_id) values (v_user_id, p_followed_user_id) on conflict do nothing;
  if found then
    insert into public.notifications (user_id, type, title, body, actor_user_id)
    values (p_followed_user_id, 'user_followed_you', 'متابعة جديدة', 'بدأ أحد المستخدمين بمتابعتك.', v_user_id);
    return query select true, 'followed', 'تمت المتابعة بنجاح.';
  end if;

  return query select true, 'noop', 'أنت تتابعه بالفعل.';
end; $$;

create or replace function public.get_profile_followers(p_profile_user_id uuid, p_limit integer default 50)
returns table (profile_id uuid, display_name text, username text, avatar_url text, city text, area text, followed_at timestamptz)
language sql security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.city, p.area, f.created_at
  from public.user_follows f
  join public.profiles p on p.id = f.follower_id
  where f.followed_id = p_profile_user_id
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

create or replace function public.get_profile_following(p_profile_user_id uuid, p_limit integer default 50)
returns table (profile_id uuid, display_name text, username text, avatar_url text, city text, area text, followed_at timestamptz)
language sql security definer set search_path = public as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.city, p.area, f.created_at
  from public.user_follows f
  join public.profiles p on p.id = f.followed_id
  where f.follower_id = p_profile_user_id
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 50));
$$;

revoke all on function public.get_profile_followers(uuid, integer) from public;
grant execute on function public.get_profile_followers(uuid, integer) to authenticated;
revoke all on function public.get_profile_following(uuid, integer) from public;
grant execute on function public.get_profile_following(uuid, integer) to authenticated;
