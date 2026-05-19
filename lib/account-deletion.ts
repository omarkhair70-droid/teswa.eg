import { supabase } from '@/lib/supabase/client';

export type AccountDeletionResult =
  | { ok: true; message: string }
  | { ok: false; reason: 'unauthenticated' | 'request_failed' | 'server_error' | 'unknown'; message: string };

type DeleteAccountResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

const DEFAULT_ERROR_MESSAGE = 'تعذر حذف الحساب حالياً. حاول مرة تانية بعد قليل.';

export async function requestMyAccountDeletion(): Promise<AccountDeletionResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, reason: 'unauthenticated', message: 'لازم تسجل دخولك أولاً قبل حذف الحساب.' };
  }

  const { data, error } = await supabase.functions.invoke<DeleteAccountResponse>('delete-account', {
    method: 'POST',
    body: {},
  });

  if (error) {
    return { ok: false, reason: 'request_failed', message: DEFAULT_ERROR_MESSAGE };
  }

  if (data?.ok) {
    return { ok: true, message: data.message?.trim() || 'تم حذف الحساب نهائيًا.' };
  }

  if (data?.error === 'unauthorized') {
    return { ok: false, reason: 'unauthenticated', message: 'انتهت الجلسة الحالية. سجّل دخولك مرة تانية ثم حاول.' };
  }

  return {
    ok: false,
    reason: 'server_error',
    message: data?.message?.trim() || DEFAULT_ERROR_MESSAGE,
  };
}
