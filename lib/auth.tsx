import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { fetchMyProfile, isProfileComplete } from '@/lib/profiles';
import { getOnboardingCompleted } from '@/lib/onboarding';

const PROFILE_CHECK_ERROR_MESSAGE = 'تعذر التحقق من بيانات الحساب. حاول مرة تانية.';

type AuthContextValue = {
  bootstrapReady: boolean;
  loadingProfile: boolean;
  session: Session | null;
  user: User | null;
  onboardingCompleted: boolean;
  profileCompleted: boolean;
  profileCheckError: string | null;
  refreshProfile: () => Promise<void>;
  setOnboardingCompletedState: (value: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [profileCheckError, setProfileCheckError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const inFlightProfileChecksRef = useRef<Map<string, Promise<void>>>(new Map());
  const activeProfileCheckTokenRef = useRef(0);

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
        const profile = await fetchMyProfile(userId);
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

  const refreshProfile = async () => {
    if (!user) {
      setProfileCompleted(false);
      setProfileCheckError(null);
      return;
    }
    await checkProfileForUser(user.id, 'manual_refresh');
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
        await checkProfileForUser(currentSession.user.id, 'bootstrap_session');
      } else {
        setProfileCheckError(null);
      }
      if (mountedRef.current) setBootstrapReady(true);
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        activeProfileCheckTokenRef.current += 1;
        setProfileCompleted(false);
        setLoadingProfile(false);
        setProfileCheckError(null);
        return;
      }

      await checkProfileForUser(nextSession.user.id, 'auth_state_change');
    });

    return () => {
      mountedRef.current = false;
      activeProfileCheckTokenRef.current += 1;
      listener.subscription.unsubscribe();
    };
  }, []);


  const value = useMemo(
    () => ({ bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted, profileCheckError, refreshProfile, setOnboardingCompletedState: setOnboardingCompleted }),
    [bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted, profileCheckError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
