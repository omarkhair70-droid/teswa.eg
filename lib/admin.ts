import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type AdminCheckResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; message: string };

export async function checkIsAdminUser(): Promise<AdminCheckResult> {
  const result = await teswaBackendRuntime.moderation.isAdmin();
  if (!result.ok) {
    return {
      ok: false,
      message: 'تعذر التحقق من صلاحيات الإدارة حالياً.',
    };
  }

  return { ok: true, isAdmin: result.data };
}
