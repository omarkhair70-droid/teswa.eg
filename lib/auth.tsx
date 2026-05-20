import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { fetchMyProfile, isProfileComplete } from '@/lib/profiles';
import { getOnboardingCompleted } from '@/lib/onboarding';
import { REQUIRED_POLICIES, fetchRequiredPolicyAcceptanceState } from '@/lib/policy-acceptance';
import { disableRegisteredPushDeviceIfPossible } from '@/lib/push-notifications';

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
  signOut: () => Promise<{ ok: true } | { ok: false; message: string }>;
  setOnboardingCompletedState: (value: boolean) => void;
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

async function clearAccountGateCache(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(accountGateCacheKey(userId));
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
  const inFlightProfileChecksRef = useRef<Map<string, Promise<void>>>(new Map());
  const activeProfileCheckTokenRef = useRef(0);
  const inFlightPolicyChecksRef = useRef<Map<string, Promise<void>>>(new Map());
  const activePolicyCheckTokenRef = useRef(0);

  const checkProfileForUser = async (userId: string, reason: string) => {
    const existingCheck = inFlightProfileChecksRef.current.get(userId);
    if (existingCheck) {
      await existingCheck;
      return;
    }

    activeProfileCheckTokenRef.current += 1;
    const checkToken = activeProfileCheckTokenRef.current;
    setLoadingProfile(true);
    setProfileCheckError(null);

    const checkPromise = (async () => {
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
        setProfileCheckError(PROFILE_CHECK_ERROR_MESSAGE);
      } finally {
        if (mountedRef.current && activeProfileCheckTokenRef.current === checkToken) {
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


  const checkPolicyAcceptanceForUser = async (userId: string) => {
    const existingCheck = inFlightPolicyChecksRef.current.get(userId);
    if (existingCheck) {
      await existingCheck;
      return;
    }

    activePolicyCheckTokenRef.current += 1;
    const checkToken = activePolicyCheckTokenRef.current;
    setLoadingPolicyAcceptance(true);
    setPolicyAcceptanceCheckError(null);

    const checkPromise = (async () => {
      try {
        const state = await fetchRequiredPolicyAcceptanceState(userId);
        if (!mountedRef.current || activePolicyCheckTokenRef.current !== checkToken) return;
        if (!state.ok) {
          setRequiredPoliciesAccepted(false);
          setPolicyAcceptanceCheckError(state.message || POLICY_CHECK_ERROR_MESSAGE);
          return;
        }

        setRequiredPoliciesAccepted(state.requiredPoliciesAccepted);
        setPolicyAcceptanceCheckError(null);
      } catch (error) {
        if (__DEV__) console.log('[Auth] policy acceptance check failed', { userId, error });
        if (!mountedRef.current || activePolicyCheckTokenRef.current !== checkToken) return;
        setRequiredPoliciesAccepted(false);
        setPolicyAcceptanceCheckError(POLICY_CHECK_ERROR_MESSAGE);
      } finally {
        if (mountedRef.current && activePolicyCheckTokenRef.current === checkToken) {
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

  const signOut = async (): Promise<{ ok: true } | { ok: false; message: string }> => {
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
      const [onboardingDone, sessionResult] = await Promise.all([
        getOnboardingCompleted(),
        supabase.auth.getSession(),
      ]);
      if (!mountedRef.current) return;
      setOnboardingCompleted(onboardingDone);
      const currentSession = sessionResult.data.session;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        const cachedGate = await readAccountGateCache(currentSession.user.id);
        if (mountedRef.current && cachedGate?.profileCompleted && cachedGate?.requiredPoliciesAccepted) {
          setProfileCompleted(true);
          setRequiredPoliciesAccepted(true);
        }
        if (mountedRef.current) setBootstrapReady(true);
        await Promise.all([
          checkProfileForUser(currentSession.user.id, 'bootstrap_session'),
          checkPolicyAcceptanceForUser(currentSession.user.id),
        ]);
      } else {
        setProfileCheckError(null);
        if (mountedRef.current) setBootstrapReady(true);
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        activeProfileCheckTokenRef.current += 1;
        activePolicyCheckTokenRef.current += 1;
        setProfileCompleted(false);
        setLoadingProfile(false);
        setProfileCheckError(null);
        setRequiredPoliciesAccepted(false);
        setLoadingPolicyAcceptance(false);
        setPolicyAcceptanceCheckError(null);
        void clearAccountGateCache(session?.user?.id);
        return;
      }

      const cachedGate = await readAccountGateCache(nextSession.user.id);
      if (cachedGate?.profileCompleted && cachedGate?.requiredPoliciesAccepted) {
        setProfileCompleted(true);
        setRequiredPoliciesAccepted(true);
      }
      await Promise.all([
        checkProfileForUser(nextSession.user.id, 'auth_state_change'),
        checkPolicyAcceptanceForUser(nextSession.user.id),
      ]);
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
    () => ({ bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted, profileCheckError, loadingPolicyAcceptance, requiredPoliciesAccepted, policyAcceptanceCheckError, refreshProfile, refreshPolicyAcceptance, signOut, setOnboardingCompletedState: setOnboardingCompleted }),
    [bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted, profileCheckError, loadingPolicyAcceptance, requiredPoliciesAccepted, policyAcceptanceCheckError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
