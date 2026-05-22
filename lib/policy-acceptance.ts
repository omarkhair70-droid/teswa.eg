import { supabase } from '@/lib/supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CURRENT_TERMS_POLICY_VERSION = '2026-05';
export const CURRENT_COMMUNITY_GUIDELINES_VERSION = '2026-05';

const POLICY_ACCEPTANCE_FETCH_TIMEOUT_MS = 12_000;
const POLICY_ACCEPTANCE_FETCH_TIMEOUT_MESSAGE = 'استغرق التحقق من موافقات السياسات وقتًا أطول من المتوقع. حاول مرة ثانية.';
const POLICY_CACHE_PREFIX = 'teswa:policy-acceptance:v1';

const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const REQUIRED_POLICIES = [
  { key: 'terms_of_use', version: CURRENT_TERMS_POLICY_VERSION },
  { key: 'community_guidelines', version: CURRENT_COMMUNITY_GUIDELINES_VERSION },
] as const;
const policyCacheKey = (userId: string, fingerprint: string) => `${POLICY_CACHE_PREFIX}:${userId}:${fingerprint}`;
const currentPolicyFingerprint = () => REQUIRED_POLICIES.map((p) => `${p.key}:${p.version}`).join('|');
const policyLog = (event: string, data?: Record<string, unknown>) => {
  console.log('[PolicyConsent]', event, data ?? {});
};

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
  const fingerprint = currentPolicyFingerprint();
  const acceptancesByKey = emptyAcceptanceMap();
  policyLog('check_start', {
    hasAuthUser: Boolean(trimmedUserId),
    hasUserId: Boolean(trimmedUserId),
    policyVersionFingerprint: fingerprint,
  });

  if (!trimmedUserId) {
    return {
      ok: false,
      requiredPoliciesAccepted: false,
      acceptancesByKey,
      missingKeys: REQUIRED_POLICIES.map((policy) => policy.key),
      message: 'لا يمكن التحقق من الموافقات بدون تسجيل الدخول.',
    };
  }

  let data: PolicyAcceptanceRow[] | null = null;
  let error: { message?: string } | null = null;

  let localCacheAccepted = false;
  try {
    const localRaw = await AsyncStorage.getItem(policyCacheKey(trimmedUserId, fingerprint));
    localCacheAccepted = localRaw === '1';
    policyLog('local_cache', { hit: localCacheAccepted ? 'hit' : 'miss' });
  } catch {
    policyLog('local_cache', { hit: 'miss' });
  }

  const fetchStart = Date.now();
  policyLog('server_fetch_start', { hasUserId: true });
  try {
    const result = await withTimeout<{ data: PolicyAcceptanceRow[] | null; error: { message?: string } | null }>(
      supabase
        .from('user_policy_acceptances')
        .select('user_id, policy_key, policy_version, accepted_at')
        .eq('user_id', trimmedUserId)
        .in('policy_key', REQUIRED_POLICIES.map((policy) => policy.key)),
      POLICY_ACCEPTANCE_FETCH_TIMEOUT_MS,
      POLICY_ACCEPTANCE_FETCH_TIMEOUT_MESSAGE,
    );

    data = (result.data as PolicyAcceptanceRow[] | null) ?? null;
    error = result.error;
  } catch (requestError) {
    policyLog('server_fetch_end', { ok: false, dtMs: Date.now() - fetchStart });
    const timeoutMessage = requestError instanceof Error ? requestError.message : POLICY_ACCEPTANCE_FETCH_TIMEOUT_MESSAGE;
    if (localCacheAccepted) {
      return {
        ok: true,
        requiredPoliciesAccepted: true,
        acceptancesByKey: { terms_of_use: true, community_guidelines: true },
        missingKeys: [],
        message: 'تم اعتماد الموافقة المحلية مؤقتًا لحين إعادة التحقق من الخادم.',
      };
    }
    return {
      ok: false,
      requiredPoliciesAccepted: false,
      acceptancesByKey,
      missingKeys: REQUIRED_POLICIES.map((policy) => policy.key),
      message: timeoutMessage || POLICY_ACCEPTANCE_FETCH_TIMEOUT_MESSAGE,
    };
  }



  if (error) {
    policyLog('server_fetch_end', { ok: false, dtMs: Date.now() - fetchStart });
    if (__DEV__) console.log('[Policy] fetch acceptance failed', { userId: trimmedUserId, message: error.message });
    if (localCacheAccepted) {
      return {
        ok: true,
        requiredPoliciesAccepted: true,
        acceptancesByKey: { terms_of_use: true, community_guidelines: true },
        missingKeys: [],
        message: 'تم اعتماد الموافقة المحلية مؤقتًا لحين إعادة التحقق من الخادم.',
      };
    }
    return {
      ok: false,
      requiredPoliciesAccepted: false,
      acceptancesByKey,
      missingKeys: REQUIRED_POLICIES.map((policy) => policy.key),
      message: 'تعذر التحقق من موافقات السياسات حالياً. حاول مرة ثانية.',
    };
  }
  policyLog('server_fetch_end', { ok: true, dtMs: Date.now() - fetchStart });

  data?.forEach((row) => {
    if (!(row.policy_key in acceptancesByKey)) return;
    const requiredPolicy = REQUIRED_POLICIES.find((policy) => policy.key === row.policy_key);
    if (!requiredPolicy) return;
    if (row.policy_version !== requiredPolicy.version) return;
    acceptancesByKey[row.policy_key] = true;
  });

  const missingKeys = REQUIRED_POLICIES
    .map((policy) => policy.key)
    .filter((key) => !acceptancesByKey[key]);

  const accepted = missingKeys.length === 0;
  policyLog('server_result', { accepted: accepted ? true : false, missingCount: missingKeys.length });
  if (accepted) {
    try {
      await AsyncStorage.setItem(policyCacheKey(trimmedUserId, fingerprint), '1');
    } catch {}
  }
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
  const fingerprint = currentPolicyFingerprint();
  if (!trimmedUserId) {
    return { ok: false, message: 'لا يمكن حفظ الموافقات بدون تسجيل الدخول.' };
  }

  const payload = REQUIRED_POLICIES.map((policy) => ({
    user_id: trimmedUserId,
    policy_key: policy.key,
    policy_version: policy.version,
  }));

  policyLog('write_start', { hasAuthUser: Boolean(trimmedUserId), hasUserId: Boolean(trimmedUserId), policyVersionFingerprint: fingerprint });
  const { error } = await supabase
    .from('user_policy_acceptances')
    .upsert(payload, {
      onConflict: 'user_id,policy_key,policy_version',
      ignoreDuplicates: true,
    });

  if (error) {
    policyLog('write_end', { ok: false, code: error.code ?? null, message: error.message ?? null });
    if (__DEV__) console.log('[Policy] record acceptance failed', { userId: trimmedUserId, code: error.code, message: error.message, details: error.details });
    if (error.code === '42501') return { ok: false, message: 'ليس لديك صلاحية لحفظ الموافقات حالياً. حاول تسجيل الدخول مرة ثانية.' };
    return { ok: false, message: 'تعذر حفظ موافقات السياسات حالياً. حاول مرة ثانية.' };
  }
  try {
    await AsyncStorage.setItem(policyCacheKey(trimmedUserId, fingerprint), '1');
  } catch {}
  policyLog('write_end', { ok: true });

  return { ok: true, message: 'تم حفظ موافقات السياسات بنجاح.' };
}
