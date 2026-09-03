import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type UserFollowState = {
  followingByMe: boolean;
  followsMe: boolean;
  mutual: boolean;
  followerCount: number;
  followingCount: number;
};

export type UserFollowActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code?: string };

export async function fetchUserFollowState(
  currentUserId: string,
  targetUserId: string,
): Promise<{ ok: true; state: UserFollowState } | { ok: false; message: string }> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };

  try {
    const state = await teswaBackendRuntime.profiles.getFollowState(me, target);
    return { ok: true, state };
  } catch {
    return { ok: false, message: 'تعذر تحميل حالة المتابعة حالياً.' };
  }
}

function providerCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object') return undefined;
  const code = (cause as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export async function followUserFromMobile(
  currentUserId: string,
  targetUserId: string,
): Promise<UserFollowActionResult> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };

  const result = await teswaBackendRuntime.profiles.follow(me, target);
  if (!result.ok) {
    const code = providerCode(result.cause);
    if (__DEV__) {
      console.log('[follow_user] provider failed', {
        code,
        message: result.message,
        me,
        target,
      });
    }
    return {
      ok: false,
      message: result.message || 'تعذر تنفيذ المتابعة حالياً.',
      code,
    };
  }
  return {
    ok: true,
    message: result.data.message || 'تمت المتابعة بنجاح.',
  };
}

export async function unfollowUserFromMobile(
  currentUserId: string,
  targetUserId: string,
): Promise<UserFollowActionResult> {
  const me = currentUserId.trim();
  const target = targetUserId.trim();
  if (!me || !target) return { ok: false, message: 'تعذر تحديد المستخدم المطلوب.' };

  const result = await teswaBackendRuntime.profiles.unfollow(me, target);
  if (!result.ok) {
    return {
      ok: false,
      message: result.message || 'تعذر إلغاء المتابعة حالياً.',
      code: providerCode(result.cause),
    };
  }
  return {
    ok: true,
    message: result.data.message || 'تم إلغاء المتابعة.',
  };
}
