import { supabase } from '@/lib/supabase/client';

export type UserBlockState = { blockedByMe: boolean; blockedMe: boolean; isBlockedEitherDirection: boolean };

export async function fetchUserBlockState(currentUserId: string, targetUserId: string): Promise<{ ok: true; state: UserBlockState } | { ok: false; message: string }> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  if (me === target) return { ok: true, state: { blockedByMe: false, blockedMe: false, isBlockedEitherDirection: false } };

  const { data, error } = await supabase.rpc('get_user_block_state', { p_target_user_id: target });
  if (error) return { ok: false, message: 'تعذر تحميل حالة الحظر حالياً.' };
  const row = Array.isArray(data) ? data[0] : null;
  return {
    ok: true,
    state: {
      blockedByMe: Boolean(row?.blocked_by_me),
      blockedMe: Boolean(row?.blocked_me),
      isBlockedEitherDirection: Boolean(row?.is_blocked_either_direction),
    },
  };
}

export async function isInteractionBlockedBetweenUsers(currentUserId: string, targetUserId: string) {
  return fetchUserBlockState(currentUserId, targetUserId);
}

export async function blockUserFromMobile(currentUserId: string, targetUserId: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const me = currentUserId.trim(); const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  if (me === target) return { ok: false, message: 'لا يمكن حظر نفسك.' };
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: me, blocked_user_id: target });
  if (error?.code === '23505') return { ok: true, message: 'المستخدم محظور بالفعل.' };
  if (error) return { ok: false, message: 'تعذر تنفيذ الحظر حالياً.' };
  return { ok: true, message: 'تم حظر المستخدم.' };
}

export async function unblockUserFromMobile(currentUserId: string, targetUserId: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const me = currentUserId.trim(); const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  if (me === target) return { ok: false, message: 'لا يمكن إلغاء حظر نفسك.' };
  const { error, count } = await supabase.from('user_blocks').delete({ count: 'exact' }).eq('blocker_id', me).eq('blocked_user_id', target);
  if (error) return { ok: false, message: 'تعذر إلغاء الحظر حالياً.' };
  if (!count) return { ok: true, message: 'المستخدم غير محظور من قبل.' };
  return { ok: true, message: 'تم إلغاء الحظر.' };
}
