import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type UserBlockState = {
  blockedByMe: boolean;
  blockedMe: boolean;
  isBlockedEitherDirection: boolean;
};

export type BlockedUserSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  blockedAt: string | null;
};

export async function fetchUserBlockState(
  currentUserId: string,
  targetUserId: string,
): Promise<{ ok: true; state: UserBlockState } | { ok: false; message: string }> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  if (me === target) {
    return {
      ok: true,
      state: {
        blockedByMe: false,
        blockedMe: false,
        isBlockedEitherDirection: false,
      },
    };
  }

  try {
    const state = await teswaBackendRuntime.profiles.getBlockState(me, target);
    return { ok: true, state };
  } catch {
    return { ok: false, message: 'تعذر تحميل حالة الحظر حالياً.' };
  }
}

export async function fetchBlockedUsers(
  currentUserId: string,
): Promise<{ ok: true; users: BlockedUserSummary[] } | { ok: false; message: string }> {
  const me = currentUserId.trim();
  if (!me) return { ok: false, message: 'سجّل الدخول أولاً لمراجعة قائمة الحظر.' };

  try {
    const users = await teswaBackendRuntime.profiles.listBlocked(me);
    return { ok: true, users };
  } catch {
    return { ok: false, message: 'تعذر تحميل المستخدمين المحظورين حالياً.' };
  }
}

export async function isInteractionBlockedBetweenUsers(
  currentUserId: string,
  targetUserId: string,
) {
  return fetchUserBlockState(currentUserId, targetUserId);
}

export async function blockUserFromMobile(
  currentUserId: string,
  targetUserId: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  if (me === target) return { ok: false, message: 'لا يمكن حظر نفسك.' };

  const result = await teswaBackendRuntime.profiles.block(me, target);
  if (!result.ok) return { ok: false, message: 'تعذر تنفيذ الحظر حالياً.' };
  return {
    ok: true,
    message: result.data.code === 'already_blocked'
      ? 'المستخدم محظور بالفعل.'
      : 'تم حظر المستخدم.',
  };
}

export async function unblockUserFromMobile(
  currentUserId: string,
  targetUserId: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };
  if (me === target) return { ok: false, message: 'لا يمكن إلغاء حظر نفسك.' };

  const result = await teswaBackendRuntime.profiles.unblock(me, target);
  if (!result.ok) return { ok: false, message: 'تعذر إلغاء الحظر حالياً.' };
  return {
    ok: true,
    message: result.data.code === 'not_blocked'
      ? 'المستخدم غير محظور من قبل.'
      : 'تم إلغاء الحظر.',
  };
}
