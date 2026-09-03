import type { IsoDateTime, TeswaResult } from '@/lib/backend/contracts/core';

export type PolicyAcceptanceRecord = {
  userId: string;
  policyKey: string;
  policyVersion: string;
  acceptedAt: IsoDateTime;
};

export interface PolicyAcceptanceContract {
  listAcceptances(input: {
    userId: string;
    policyKeys: string[];
  }): Promise<TeswaResult<PolicyAcceptanceRecord[], 'unknown'>>;

  recordAcceptances(input: {
    userId: string;
    policies: Array<{
      policyKey: string;
      policyVersion: string;
    }>;
  }): Promise<TeswaResult<void, 'forbidden' | 'unknown'>>;
}
