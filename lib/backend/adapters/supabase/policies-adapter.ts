import type {
  PolicyAcceptanceContract,
  PolicyAcceptanceRecord,
} from '@/lib/backend/contracts/policies';
import { supabase } from '@/lib/supabase/client';

export function createSupabasePolicyAcceptanceAdapter(): PolicyAcceptanceContract {
  return {
    async listAcceptances(input) {
      const { data, error } = await supabase
        .from('user_policy_acceptances')
        .select('user_id,policy_key,policy_version,accepted_at')
        .eq('user_id', input.userId)
        .in('policy_key', input.policyKeys);

      if (error) {
        return {
          ok: false,
          reason: 'unknown',
          message: error.message,
          cause: error,
        };
      }

      const rows: PolicyAcceptanceRecord[] = (data ?? []).map((row) => ({
        userId: row.user_id as string,
        policyKey: row.policy_key as string,
        policyVersion: row.policy_version as string,
        acceptedAt: row.accepted_at as string,
      }));

      return { ok: true, data: rows };
    },

    async recordAcceptances(input) {
      const { error } = await supabase
        .from('user_policy_acceptances')
        .upsert(
          input.policies.map((policy) => ({
            user_id: input.userId,
            policy_key: policy.policyKey,
            policy_version: policy.policyVersion,
          })),
          {
            onConflict: 'user_id,policy_key,policy_version',
            ignoreDuplicates: true,
          },
        );

      if (error) {
        return {
          ok: false,
          reason: error.code === '42501' ? 'forbidden' : 'unknown',
          message: error.message,
          cause: error,
        };
      }

      return { ok: true, data: undefined };
    },
  };
}
