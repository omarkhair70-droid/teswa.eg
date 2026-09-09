import type { TeswaResult } from '@/lib/backend/contracts/core';

export type AccountDeletionTransportResponse = {
  ok: boolean;
  message: string | null;
  errorCode: string | null;
};

export interface AccountLifecycleContract {
  requestDeletion(): Promise<
    TeswaResult<AccountDeletionTransportResponse, 'request_failed' | 'unknown'>
  >;
}
