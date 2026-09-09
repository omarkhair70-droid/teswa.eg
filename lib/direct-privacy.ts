import type { DirectMessagePrivacy } from '@/lib/backend/contracts/profile';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type DirectPrivacySetting = DirectMessagePrivacy;

export async function fetchDirectPrivacySetting(): Promise<
  { ok: true; value: DirectPrivacySetting } | { ok: false; message: string }
> {
  let userId: string | null = null;
  try {
    userId = (await teswaBackendRuntime.auth.getCurrentUser())?.id ?? null;
  } catch {}
  if (!userId) return { ok: false, message: 'لازم تسجل دخول الأول.' };

  try {
    const value = await teswaBackendRuntime.profiles.getDirectMessagePrivacy(userId);
    return { ok: true, value };
  } catch {
    return { ok: false, message: 'تعذر تحميل خصوصية الرسائل حالياً.' };
  }
}

export async function updateDirectPrivacySetting(
  value: DirectPrivacySetting,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let userId: string | null = null;
  try {
    userId = (await teswaBackendRuntime.auth.getCurrentUser())?.id ?? null;
  } catch {}
  if (!userId) return { ok: false, message: 'لازم تسجل دخول الأول.' };

  const result = await teswaBackendRuntime.profiles.updateDirectMessagePrivacy(userId, value);
  return result.ok
    ? { ok: true }
    : { ok: false, message: 'تعذر تحديث خصوصية الرسائل حالياً.' };
}
