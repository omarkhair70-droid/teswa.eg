import { supabase } from '@/lib/supabase/client';

export const CURRENT_TERMS_POLICY_VERSION = '2026-05';
export const CURRENT_COMMUNITY_GUIDELINES_VERSION = '2026-05';

export const REQUIRED_POLICIES = [
  { key: 'terms_of_use', version: CURRENT_TERMS_POLICY_VERSION },
  { key: 'community_guidelines', version: CURRENT_COMMUNITY_GUIDELINES_VERSION },
] as const;

export type RequiredPolicyKey = typeof REQUIRED_POLICIES[number]['key'];

type PolicyAcceptanceRow = {
  user_id: string;
  policy_key: RequiredPolicyKey;
  policy_version: string;
  accepted_at: string;
};

export type RequiredPolicyAcceptanceState = {
  ok: true;
  requiredPoliciesAccepted: boolean;
  acceptancesByKey: Record<RequiredPolicyKey, boolean>;
  missingKeys: RequiredPolicyKey[];
  message: string;
} | {
  ok: false;
  requiredPoliciesAccepted: false;
  acceptancesByKey: Record<RequiredPolicyKey, boolean>;
  missingKeys: RequiredPolicyKey[];
  message: string;
};

const emptyAcceptanceMap = (): Record<RequiredPolicyKey, boolean> => ({
  terms_of_use: false,
  community_guidelines: false,
});

export function hasAcceptedCurrentRequiredPolicies(
  acceptancesByKey: Record<RequiredPolicyKey, boolean>,
): boolean {
  return REQUIRED_POLICIES.every((policy) => acceptancesByKey[policy.key]);
}

export async function fetchRequiredPolicyAcceptanceState(
  userId: string,
): Promise<RequiredPolicyAcceptanceState> {
  const trimmedUserId = userId.trim();
  const acceptancesByKey = emptyAcceptanceMap();

  if (!trimmedUserId) {
    return {
      ok: false,
      requiredPoliciesAccepted: false,
      acceptancesByKey,
      missingKeys: REQUIRED_POLICIES.map((policy) => policy.key),
      message: 'لا يمكن التحقق من الموافقات بدون تسجيل الدخول.',
    };
  }

  const { data, error } = await supabase
    .from('user_policy_acceptances')
    .select('user_id, policy_key, policy_version, accepted_at')
    .eq('user_id', trimmedUserId)
    .or(
      REQUIRED_POLICIES
        .map((policy) => `and(policy_key.eq.${policy.key},policy_version.eq.${policy.version})`)
        .join(','),
    );

  if (error) {
    return {
      ok: false,
      requiredPoliciesAccepted: false,
      acceptancesByKey,
      missingKeys: REQUIRED_POLICIES.map((policy) => policy.key),
      message: 'تعذر التحقق من موافقات السياسات حالياً. حاول مرة ثانية.',
    };
  }

  (data as PolicyAcceptanceRow[] | null)?.forEach((row) => {
    if (row.policy_key in acceptancesByKey) acceptancesByKey[row.policy_key] = true;
  });

  const missingKeys = REQUIRED_POLICIES
    .map((policy) => policy.key)
    .filter((key) => !acceptancesByKey[key]);

  const accepted = missingKeys.length === 0;
  return {
    ok: true,
    requiredPoliciesAccepted: accepted,
    acceptancesByKey,
    missingKeys,
    message: accepted ? 'تم تسجيل موافقات السياسات المطلوبة.' : 'يلزم قبول السياسات المطلوبة للمتابعة.',
  };
}

export async function recordRequiredPolicyAcceptances(userId: string): Promise<{
  ok: true;
  message: string;
} | {
  ok: false;
  message: string;
}> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { ok: false, message: 'لا يمكن حفظ الموافقات بدون تسجيل الدخول.' };
  }

  const payload = REQUIRED_POLICIES.map((policy) => ({
    user_id: trimmedUserId,
    policy_key: policy.key,
    policy_version: policy.version,
  }));

  const { error } = await supabase
    .from('user_policy_acceptances')
    .insert(payload, { upsert: true, onConflict: 'user_id,policy_key,policy_version' });

  if (error) {
    return { ok: false, message: 'تعذر حفظ موافقات السياسات حالياً. حاول مرة ثانية.' };
  }

  return { ok: true, message: 'تم حفظ موافقات السياسات بنجاح.' };
}
