create table if not exists public.user_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_pk primary key (follower_id, followed_id),
  constraint user_follows_not_self check (follower_id <> followed_id)
);

create index if not exists user_follows_followed_created_idx on public.user_follows (followed_id, created_at desc);
create index if not exists user_follows_follower_created_idx on public.user_follows (follower_id, created_at desc);

alter table public.user_follows enable row level security;

create policy user_follows_select_authenticated on public.user_follows
for select to authenticated
using (true);

create policy user_follows_insert_own on public.user_follows
for insert to authenticated
with check (follower_id = auth.uid());

create policy user_follows_delete_own on public.user_follows
for delete to authenticated
using (follower_id = auth.uid());

create or replace function public.follow_user(p_followed_user_id uuid)
returns table (ok boolean, code text, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return query select false, 'unauthorized', 'يجب تسجيل الدخول أولاً.'; return; end if;
  if p_followed_user_id is null then return query select false, 'invalid_target', 'تعذر تحديد المستخدم المطلوب.'; return; end if;
  if v_user_id = p_followed_user_id then return query select false, 'self_follow', 'لا يمكن متابعة نفسك.'; return; end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id=v_user_id and b.blocked_user_id=p_followed_user_id) or (b.blocker_id=p_followed_user_id and b.blocked_user_id=v_user_id)) then
    return query select false, 'blocked', 'لا يمكن تنفيذ المتابعة بسبب إعدادات الحظر.'; return;
  end if;

  insert into public.user_follows (follower_id, followed_id)
  values (v_user_id, p_followed_user_id)
  on conflict do nothing;

  if found then
    insert into public.notifications (user_id, type, title, body, item_id, offer_id, deal_id, contextual_conversation_id)
    values (p_followed_user_id, 'user_followed_you', 'متابعة جديدة', 'بدأ أحد المستخدمين بمتابعتك.', null, null, null, null);
    return query select true, 'followed', 'تمت المتابعة بنجاح.';
  end if;

  return query select true, 'noop', 'أنت تتابعه بالفعل.';
end;
$$;

create or replace function public.unfollow_user(p_followed_user_id uuid)
returns table (ok boolean, code text, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return query select false, 'unauthorized', 'يجب تسجيل الدخول أولاً.'; return; end if;
  if p_followed_user_id is null then return query select false, 'invalid_target', 'تعذر تحديد المستخدم المطلوب.'; return; end if;
  if v_user_id = p_followed_user_id then return query select false, 'self_unfollow', 'لا يمكن تنفيذ هذا الإجراء على نفسك.'; return; end if;

  delete from public.user_follows where follower_id = v_user_id and followed_id = p_followed_user_id;
  return query select true, 'unfollowed', 'تم إلغاء المتابعة.';
end;
$$;

create or replace function public.get_user_follow_state(p_target_user_id uuid)
returns table (following_by_me boolean, follows_me boolean, mutual boolean, follower_count bigint, following_count bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_following_by_me boolean := false;
  v_follows_me boolean := false;
begin
  if p_target_user_id is null then return; end if;
  if v_user_id is not null and v_user_id <> p_target_user_id then
    select exists(select 1 from public.user_follows f where f.follower_id = v_user_id and f.followed_id = p_target_user_id) into v_following_by_me;
    select exists(select 1 from public.user_follows f where f.follower_id = p_target_user_id and f.followed_id = v_user_id) into v_follows_me;
  end if;

  return query select v_following_by_me, v_follows_me, (v_following_by_me and v_follows_me),
    (select count(*) from public.user_follows where followed_id = p_target_user_id),
    (select count(*) from public.user_follows where follower_id = p_target_user_id);
end;
$$;

revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;
revoke all on function public.unfollow_user(uuid) from public;
grant execute on function public.unfollow_user(uuid) to authenticated;
revoke all on function public.get_user_follow_state(uuid) from public;
grant execute on function public.get_user_follow_state(uuid) to authenticated;

create or replace function public.cleanup_follow_edges_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_follows
  where (follower_id = new.blocker_id and followed_id = new.blocked_user_id)
     or (follower_id = new.blocked_user_id and followed_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists user_blocks_cleanup_follow_edges on public.user_blocks;
create trigger user_blocks_cleanup_follow_edges
after insert on public.user_blocks
for each row execute procedure public.cleanup_follow_edges_on_block();
