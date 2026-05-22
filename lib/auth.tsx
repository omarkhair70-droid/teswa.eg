import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { fetchMyProfile, isProfileComplete } from '@/lib/profiles';
import { getOnboardingCompleted } from '@/lib/onboarding';
import { REQUIRED_POLICIES, fetchRequiredPolicyAcceptanceState } from '@/lib/policy-acceptance';
import { disableRegisteredPushDeviceIfPossible } from '@/lib/push-notifications';
import { startupTrace } from '@/lib/startup-trace';

const PROFILE_CHECK_ERROR_MESSAGE = 'تعذر التحقق من بيانات الحساب. حاول مرة تانية.';
const SIGN_OUT_ERROR_MESSAGE = 'تعذر تسجيل الخروج. حاول مرة تانية.';
const SIGNED_IN_PROFILE_RETRY_DELAY_MS = 650;
const POLICY_CHECK_ERROR_MESSAGE = 'تعذر التحقق من موافقات السياسات. حاول مرة تانية.';
const ACCOUNT_GATE_CACHE_PREFIX = 'teswa:account-gate:v1';

type AuthContextValue = {
  bootstrapReady: boolean;
  loadingProfile: boolean;
  session: Session | null;
  user: User | null;
  onboardingCompleted: boolean;
  profileCompleted: boolean;
  profileCheckError: string | null;
  loadingPolicyAcceptance: boolean;
  requiredPoliciesAccepted: boolean;
  policyAcceptanceCheckError: string | null;
  refreshProfile: () => Promise<void>;
  refreshPolicyAcceptance: () => Promise<void>;
  markPolicyAcceptanceConfirmed: () => void;
  signOut: () => Promise<{ ok: true } | { ok: false; message: string }>;
  setOnboardingCompletedState: (value: boolean) => void;
  usingCachedAccountGate: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AccountGateCache = {
  userId: string;
  profileCompleted: boolean;
  requiredPoliciesAccepted: boolean;
  policyFingerprint: string;
  verifiedAt: string;
};

const policyFingerprint = () => REQUIRED_POLICIES.map((policy) => `${policy.key}:${policy.version}`).join('|');
const accountGateCacheKey = (userId: string) => `${ACCOUNT_GATE_CACHE_PREFIX}:${userId}`;

async function readAccountGateCache(userId: string): Promise<AccountGateCache | null> {
  try {
    const raw = await AsyncStorage.getItem(accountGateCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountGateCache;
    if (parsed.userId !== userId || parsed.policyFingerprint !== policyFingerprint()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeAccountGateCache(entry: AccountGateCache): Promise<void> {
  try {
    await AsyncStorage.setItem(accountGateCacheKey(entry.userId), JSON.stringify(entry));
  } catch {}
}




export function AuthProvider({ children }: PropsWithChildren) {
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [profileCheckError, setProfileCheckError] = useState<string | null>(null);
  const [loadingPolicyAcceptance, setLoadingPolicyAcceptance] = useState(false);
  const [requiredPoliciesAccepted, setRequiredPoliciesAccepted] = useState(false);
  const [policyAcceptanceCheckError, setPolicyAcceptanceCheckError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const lastAuthenticatedUserIdRef = useRef<string | null>(null);
  const inFlightProfileChecksRef = useRef<Map<string, Promise<void>>>(new Map());
  const activeProfileCheckTokenRef = useRef(0);
  const inFlightPolicyChecksRef = useRef<Map<string, Promise<void>>>(new Map());
  const activePolicyCheckTokenRef = useRef(0);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [usingCachedAccountGate, setUsingCachedAccountGate] = useState(false);

  const checkProfileForUser = async (userId: string, reason: string, options?: { background?: boolean; suppressErrors?: boolean }) => {
    const existingCheck = inFlightProfileChecksRef.current.get(userId);
    if (existingCheck) {
      await existingCheck;
      return;
    }

    activeProfileCheckTokenRef.current += 1;
    const checkToken = activeProfileCheckTokenRef.current;
    if (!options?.background) setLoadingProfile(true);
    setProfileCheckError(null);

    const checkPromise = (async () => {
      startupTrace.mark('profile_check_start', { reason });
      try {
        const shouldRetrySignedInBootstrap =
          reason === 'auth_state_change' || reason === 'bootstrap_session';

        const fetchProfileWithOptionalRetry = async () => {
          try {
            return await fetchMyProfile(userId);
          } catch (firstError) {
            if (!shouldRetrySignedInBootstrap) throw firstError;
            await new Promise((resolve) => setTimeout(resolve, SIGNED_IN_PROFILE_RETRY_DELAY_MS));
            return await fetchMyProfile(userId);
          }
        };

        const profile = await fetchProfileWithOptionalRetry();
        const completed = isProfileComplete(profile);
        if (!mountedRef.current || activeProfileCheckTokenRef.current !== checkToken) return;
        setProfileCompleted(completed);
        setProfileCheckError(null);
      } catch (error) {
        if (__DEV__) console.log('[Auth] profile check failed', { userId, error });
        if (!mountedRef.current || activeProfileCheckTokenRef.current !== checkToken) return;
        if (!options?.suppressErrors) setProfileCheckError(PROFILE_CHECK_ERROR_MESSAGE);
      } finally {
        startupTrace.mark('profile_check_end', { reason });
        if (!options?.background && mountedRef.current && activeProfileCheckTokenRef.current === checkToken) {
          setLoadingProfile(false);
        }
      }
    })();

    inFlightProfileChecksRef.current.set(userId, checkPromise);
    try {
      await checkPromise;
    } finally {
      const activeCheck = inFlightProfileChecksRef.current.get(userId);
      if (activeCheck === checkPromise) {
        inFlightProfileChecksRef.current.delete(userId);
      }
    }
  };


  const checkPolicyAcceptanceForUser = async (userId: string, options?: { background?: boolean; suppressErrors?: boolean }) => {
    const existingCheck = inFlightPolicyChecksRef.current.get(userId);
    if (existingCheck) {
      await existingCheck;
      return;
    }

    activePolicyCheckTokenRef.current += 1;
    const checkToken = activePolicyCheckTokenRef.current;
    if (!options?.background) setLoadingPolicyAcceptance(true);
    setPolicyAcceptanceCheckError(null);

    const checkPromise = (async () => {
      startupTrace.mark('policy_check_start');
      try {
        const state = await fetchRequiredPolicyAcceptanceState(userId);
        if (!mountedRef.current || activePolicyCheckTokenRef.current !== checkToken) return;
        if (!state.ok) {
          setRequiredPoliciesAccepted(false);
          if (!options?.suppressErrors) setPolicyAcceptanceCheckError(state.message || POLICY_CHECK_ERROR_MESSAGE);
          return;
        }

        setRequiredPoliciesAccepted(state.requiredPoliciesAccepted);
        setPolicyAcceptanceCheckError(null);
      } catch (error) {
        if (__DEV__) console.log('[Auth] policy acceptance check failed', { userId, error });
        if (!mountedRef.current || activePolicyCheckTokenRef.current !== checkToken) return;
        if (!options?.suppressErrors) {
          setRequiredPoliciesAccepted(false);
          setPolicyAcceptanceCheckError(POLICY_CHECK_ERROR_MESSAGE);
        }
      } finally {
        startupTrace.mark('policy_check_end');
        if (!options?.background && mountedRef.current && activePolicyCheckTokenRef.current === checkToken) {
          setLoadingPolicyAcceptance(false);
        }
      }
    })();

    inFlightPolicyChecksRef.current.set(userId, checkPromise);
    try {
      await checkPromise;
    } finally {
      const activeCheck = inFlightPolicyChecksRef.current.get(userId);
      if (activeCheck === checkPromise) inFlightPolicyChecksRef.current.delete(userId);
    }
  };

  const refreshProfile = async () => {
    if (!user) {
      setProfileCompleted(false);
      setProfileCheckError(null);
      return;
    }
    await checkProfileForUser(user.id, 'manual_refresh');
  };

  const refreshPolicyAcceptance = async () => {
    if (!user) {
      setRequiredPoliciesAccepted(false);
      setPolicyAcceptanceCheckError(null);
      return;
    }
    await checkPolicyAcceptanceForUser(user.id);
  };

  const markPolicyAcceptanceConfirmed = () => {
    if (!user?.id) return;
    setRequiredPoliciesAccepted(true);
    setPolicyAcceptanceCheckError(null);
    if (!profileCompleted) return;
    void writeAccountGateCache({
      userId: user.id,
      profileCompleted,
      requiredPoliciesAccepted: true,
      policyFingerprint: policyFingerprint(),
      verifiedAt: new Date().toISOString(),
    });
  };

  const signOut = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    // Keep per-user account-gate cache across sign-out so returning users can re-enter quickly;
    // safety is preserved because cache lookup is scoped by userId + policy fingerprint.
    await disableRegisteredPushDeviceIfPossible();
    const { error } = await supabase.auth.signOut();
    if (error) {
      if (__DEV__) console.log('[Auth] sign out failed', error);
      return { ok: false, message: SIGN_OUT_ERROR_MESSAGE };
    }

    return { ok: true };
  };

  useEffect(() => {
    mountedRef.current = true;
    const bootstrap = async () => {
      try {
        startupTrace.mark('bootstrap_start');
        setBootstrapError(null);
        const onboardingPromise = getOnboardingCompleted().then((value) => {
          startupTrace.mark('onboarding_read_done');
          return value;
        });
        const sessionPromise = supabase.auth.getSession().then((value) => {
          startupTrace.mark('get_session_done', { hasSession: Boolean(value.data.session) });
          return value;
        });
        const [onboardingDone, sessionResult] = await Promise.all([
          onboardingPromise,
          sessionPromise,
        ]);
        if (!mountedRef.current) return;
        setOnboardingCompleted(onboardingDone);
        const currentSession = sessionResult.data.session;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        lastAuthenticatedUserIdRef.current = currentSession?.user?.id ?? null;
        if (currentSession?.user) {
          const cachedGate = await readAccountGateCache(currentSession.user.id);
          const canUseCachedGate = Boolean(cachedGate?.profileCompleted && cachedGate?.requiredPoliciesAccepted);
          startupTrace.mark('account_gate_cache_read_done', { hasCachedGate: canUseCachedGate, hasSession: true });
          if (mountedRef.current && canUseCachedGate) {
            setProfileCompleted(true);
            setRequiredPoliciesAccepted(true);
            setUsingCachedAccountGate(true);
          }
          if (mountedRef.current) {
            setBootstrapReady(true);
            startupTrace.mark('bootstrap_ready_set', { hasSession: true, usedCachedGate: canUseCachedGate });
          }
          await Promise.all([
            checkProfileForUser(currentSession.user.id, 'bootstrap_session', { background: canUseCachedGate, suppressErrors: canUseCachedGate }),
            checkPolicyAcceptanceForUser(currentSession.user.id, { background: canUseCachedGate, suppressErrors: canUseCachedGate }),
          ]);
          if (mountedRef.current) setUsingCachedAccountGate(false);
        } else {
          startupTrace.mark('account_gate_cache_read_done', { hasCachedGate: false, hasSession: false });
          setProfileCheckError(null);
          setUsingCachedAccountGate(false);
          if (mountedRef.current) {
            setBootstrapReady(true);
            startupTrace.mark('bootstrap_ready_set', { hasSession: false, usedCachedGate: false });
          }
        }
      } catch (error) {
        if (__DEV__) console.log('[Auth] bootstrap failed', error);
        if (!mountedRef.current) return;
        setSession(null);
        setUser(null);
        setProfileCompleted(false);
        setRequiredPoliciesAccepted(false);
        setProfileCheckError(null);
        setPolicyAcceptanceCheckError(null);
        setBootstrapError('تعذر تهيئة تسجيل الدخول حالياً. حاول مرة أخرى.');
        if (mountedRef.current) {
          setBootstrapReady(true);
          startupTrace.mark('bootstrap_ready_set', { outcome: 'error' });
        }
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      startupTrace.mark('auth_state_change_start', { hasSession: Boolean(nextSession?.user) });
      try {
        setBootstrapError(null);
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        if (!nextSession?.user) {
          lastAuthenticatedUserIdRef.current = null;
          activeProfileCheckTokenRef.current += 1;
          activePolicyCheckTokenRef.current += 1;
          setProfileCompleted(false);
          setLoadingProfile(false);
          setProfileCheckError(null);
          setRequiredPoliciesAccepted(false);
          setLoadingPolicyAcceptance(false);
          setPolicyAcceptanceCheckError(null);
          setUsingCachedAccountGate(false);
          return;
        }
        lastAuthenticatedUserIdRef.current = nextSession.user.id;

        const cachedGate = await readAccountGateCache(nextSession.user.id);
        const canUseCachedGate = Boolean(cachedGate?.profileCompleted && cachedGate?.requiredPoliciesAccepted);
        startupTrace.mark('account_gate_cache_read_done', { hasCachedGate: canUseCachedGate, hasSession: true });
        if (canUseCachedGate) {
          setProfileCompleted(true);
          setRequiredPoliciesAccepted(true);
          setUsingCachedAccountGate(true);
        }
        await Promise.all([
          checkProfileForUser(nextSession.user.id, 'auth_state_change', { background: canUseCachedGate, suppressErrors: canUseCachedGate }),
          checkPolicyAcceptanceForUser(nextSession.user.id, { background: canUseCachedGate, suppressErrors: canUseCachedGate }),
        ]);
        if (mountedRef.current) setUsingCachedAccountGate(false);
        startupTrace.mark('auth_state_change_end', { outcome: 'ok', usedCachedGate: canUseCachedGate });
      } catch (error) {
        if (__DEV__) console.log('[Auth] auth state sync failed', error);
        if (!mountedRef.current) return;
        setProfileCheckError(PROFILE_CHECK_ERROR_MESSAGE);
        startupTrace.mark('auth_state_change_end', { outcome: 'error' });
      }
    });

    return () => {
      mountedRef.current = false;
      activeProfileCheckTokenRef.current += 1;
      activePolicyCheckTokenRef.current += 1;
      listener.subscription.unsubscribe();
    };
  }, []);



  useEffect(() => {
    if (!user?.id) return;
    if (profileCheckError || policyAcceptanceCheckError) return;
    if (!profileCompleted || !requiredPoliciesAccepted) return;
    void writeAccountGateCache({
      userId: user.id,
      profileCompleted: true,
      requiredPoliciesAccepted: true,
      policyFingerprint: policyFingerprint(),
      verifiedAt: new Date().toISOString(),
    });
  }, [policyAcceptanceCheckError, profileCheckError, profileCompleted, requiredPoliciesAccepted, user?.id]);
  const value = useMemo(
    () => ({ bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted, profileCheckError: profileCheckError ?? bootstrapError, loadingPolicyAcceptance, requiredPoliciesAccepted, policyAcceptanceCheckError, refreshProfile, refreshPolicyAcceptance, markPolicyAcceptanceConfirmed, signOut, setOnboardingCompletedState: setOnboardingCompleted, usingCachedAccountGate }),
    [bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted, profileCheckError, bootstrapError, loadingPolicyAcceptance, requiredPoliciesAccepted, policyAcceptanceCheckError, usingCachedAccountGate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
