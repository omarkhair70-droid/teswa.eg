import { supabase } from '@/lib/supabase/client';

export type UserFollowState = {
  followingByMe: boolean;
  followsMe: boolean;
  mutual: boolean;
  followerCount: number;
  followingCount: number;
};

export type UserFollowActionResult = { ok: true; message: string } | { ok: false; message: string; code?: string };

export async function fetchUserFollowState(currentUserId: string, targetUserId: string): Promise<{ ok: true; state: UserFollowState } | { ok: false; message: string }> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };

  const { data, error } = await supabase.rpc('get_user_follow_state', { p_target_user_id: target });
  if (error) return { ok: false, message: 'تعذر تحميل حالة المتابعة حالياً.' };

  const row = Array.isArray(data) ? data[0] : null;
  return {
    ok: true,
    state: {
      followingByMe: Boolean(row?.following_by_me),
      followsMe: Boolean(row?.follows_me),
      mutual: Boolean(row?.mutual),
      followerCount: Number(row?.follower_count ?? 0),
      followingCount: Number(row?.following_count ?? 0),
    },
  };
}

export async function followUserFromMobile(currentUserId: string, targetUserId: string): Promise<UserFollowActionResult> {
  const me = currentUserId.trim(); const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  const { data, error } = await supabase.rpc('follow_user', { p_followed_user_id: target });
  if (error) {
    if (__DEV__) console.log('[follow_user] rpc failed', { code: error.code, message: error.message, details: (error as any).details, hint: (error as any).hint, me, target });
    return { ok: false, message: 'تعذر تنفيذ المتابعة حالياً.', code: error.code };
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.ok) return { ok: false, message: row?.message ?? 'تعذر تنفيذ المتابعة حالياً.', code: row?.code ?? undefined };
  return { ok: true, message: row.message ?? 'تمت المتابعة بنجاح.' };
}

export async function unfollowUserFromMobile(currentUserId: string, targetUserId: string): Promise<UserFollowActionResult> {
  const me = currentUserId.trim(); const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  const { data, error } = await supabase.rpc('unfollow_user', { p_followed_user_id: target });
  if (error) return { ok: false, message: 'تعذر إلغاء المتابعة حالياً.', code: error.code };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.ok) return { ok: false, message: row?.message ?? 'تعذر إلغاء المتابعة حالياً.', code: row?.code ?? undefined };
  return { ok: true, message: row.message ?? 'تم إلغاء المتابعة.' };
}
