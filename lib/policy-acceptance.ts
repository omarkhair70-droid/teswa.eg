import { teswaBackendRuntime } from '@/lib/backend/runtime';
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
  userId: string;
  policyKey: RequiredPolicyKey;
  policyVersion: string;
  acceptedAt: string;
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
    policyLog('local_cache', { localCacheAccepted });
  } catch {
    policyLog('local_cache', { localCacheAccepted: false });
  }

  const fetchStart = Date.now();
  policyLog('server_fetch_start', { hasUserId: true });
  try {
    const result = await withTimeout(
      teswaBackendRuntime.policies.listAcceptances({
        userId: trimmedUserId,
        policyKeys: REQUIRED_POLICIES.map((policy) => policy.key),
      }),
      POLICY_ACCEPTANCE_FETCH_TIMEOUT_MS,
      POLICY_ACCEPTANCE_FETCH_TIMEOUT_MESSAGE,
    );

    if (result.ok) {
      data = result.data.map((row) => ({
        userId: row.userId,
        policyKey: row.policyKey as RequiredPolicyKey,
        policyVersion: row.policyVersion,
        acceptedAt: row.acceptedAt,
      }));
      error = null;
    } else {
      data = null;
      error = { message: result.message };
    }
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
  policyLog('server_fetch_end', { ok: true, dtMs: Date.now() - fetchStart, rowCount: data?.length ?? 0 });

  data?.forEach((row) => {
    if (!(row.policyKey in acceptancesByKey)) return;
    const requiredPolicy = REQUIRED_POLICIES.find((policy) => policy.key === row.policyKey);
    if (!requiredPolicy) return;
    if (row.policyVersion !== requiredPolicy.version) return;
    acceptancesByKey[row.policyKey] = true;
  });

  const missingKeys = REQUIRED_POLICIES
    .map((policy) => policy.key)
    .filter((key) => !acceptancesByKey[key]);

  const accepted = missingKeys.length === 0;
  policyLog('server_result', { serverAccepted: accepted, missingKeys, rowCount: data?.length ?? 0 });
  if (!accepted && (data?.length ?? 0) === 0 && localCacheAccepted) {
    policyLog('server_empty_but_local_cache_accepted', { localCacheAccepted: true, rowCount: 0 });
    return {
      ok: true,
      requiredPoliciesAccepted: true,
      acceptancesByKey: { terms_of_use: true, community_guidelines: true },
      missingKeys: [],
      message: 'تم اعتماد الموافقة المحلية مؤقتًا لحين إعادة التحقق من الخادم.',
    };
  }
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

  policyLog('write_start', { hasAuthUser: Boolean(trimmedUserId), hasUserId: Boolean(trimmedUserId), policyVersionFingerprint: fingerprint });
  const result = await teswaBackendRuntime.policies.recordAcceptances({
    userId: trimmedUserId,
    policies: REQUIRED_POLICIES.map((policy) => ({
      policyKey: policy.key,
      policyVersion: policy.version,
    })),
  });

  if (!result.ok) {
    policyLog('write_end', {
      ok: false,
      code: result.reason,
      message: result.message,
    });
    if (__DEV__) {
      console.log('[Policy] record acceptance failed', {
        userId: trimmedUserId,
        reason: result.reason,
        message: result.message,
      });
    }
    if (result.reason === 'forbidden') {
      return {
        ok: false,
        message: 'ليس لديك صلاحية لحفظ الموافقات حالياً. حاول تسجيل الدخول مرة ثانية.',
      };
    }
    return {
      ok: false,
      message: 'تعذر حفظ موافقات السياسات حالياً. حاول مرة ثانية.',
    };
  }
  try {
    await AsyncStorage.setItem(policyCacheKey(trimmedUserId, fingerprint), '1');
  } catch {}
  policyLog('write_end', { ok: true });

  return { ok: true, message: 'تم حفظ موافقات السياسات بنجاح.' };
}
