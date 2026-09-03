import type {
  AccountDeletionTransportResponse,
  AccountLifecycleContract,
} from '@/lib/backend/contracts/account';
import { supabase } from '@/lib/supabase/client';

type DeleteAccountResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export function createSupabaseAccountLifecycleAdapter(): AccountLifecycleContract {
  return {
    async requestDeletion() {
      const { data, error } =
        await supabase.functions.invoke<DeleteAccountResponse>('delete-account', {
          method: 'POST',
          body: {},
        });

      if (error) {
        return {
          ok: false,
          reason: 'request_failed',
          message: error.message,
          cause: error,
        };
      }

      const response: AccountDeletionTransportResponse = {
        ok: data?.ok === true,
        message:
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : null,
        errorCode:
          typeof data?.error === 'string' && data.error.trim()
            ? data.error.trim()
            : null,
      };

      return { ok: true, data: response };
    },
  };
}
