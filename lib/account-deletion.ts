import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type AccountDeletionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      reason:
        | 'unauthenticated'
        | 'request_failed'
        | 'server_error'
        | 'unknown';
      message: string;
    };

const DEFAULT_ERROR_MESSAGE =
  'تعذر حذف الحساب حالياً. حاول مرة تانية بعد قليل.';

export async function requestMyAccountDeletion(): Promise<AccountDeletionResult> {
  let session = null;
  try {
    session = await teswaBackendRuntime.auth.getSession();
  } catch {}

  if (!session?.accessToken) {
    return {
      ok: false,
      reason: 'unauthenticated',
      message: 'لازم تسجل دخولك أولاً قبل حذف الحساب.',
    };
  }

  const result = await teswaBackendRuntime.account.requestDeletion();

  if (!result.ok) {
    return {
      ok: false,
      reason: 'request_failed',
      message: DEFAULT_ERROR_MESSAGE,
    };
  }

  if (result.data.ok) {
    return {
      ok: true,
      message: result.data.message || 'تم حذف الحساب نهائيًا.',
    };
  }

  if (result.data.errorCode === 'unauthorized') {
    return {
      ok: false,
      reason: 'unauthenticated',
      message: 'انتهت الجلسة الحالية. سجّل دخولك مرة تانية ثم حاول.',
    };
  }

  return {
    ok: false,
    reason: 'server_error',
    message: result.data.message || DEFAULT_ERROR_MESSAGE,
  };
}
