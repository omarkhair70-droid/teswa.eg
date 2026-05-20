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
    begin
      insert into public.notifications (user_id, type, title, body, actor_user_id)
      values (p_followed_user_id, 'user_followed_you', 'متابعة جديدة', 'بدأ أحد المستخدمين بمتابعتك.', v_user_id);
    exception
      when others then
        null;
    end;
    return query select true, 'followed', 'تمت المتابعة بنجاح.';
  end if;

  return query select true, 'noop', 'أنت تتابعه بالفعل.';
end;
$$;
