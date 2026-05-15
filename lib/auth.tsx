import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
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

  const refreshProfile = async () => {
    if (!user) {
      setProfileCompleted(false);
      setProfileCheckError(null);
      return;
    }
    setLoadingProfile(true);
    setProfileCheckError(null);
    try {
      if (__DEV__) console.log('[Auth] profile check userId', user.id);
      const profile = await fetchMyProfile(user.id);
      const completed = isProfileComplete(profile);
      if (__DEV__) {
        console.log('[Auth] profile result', profile);
        console.log('[Auth] profile completed', completed);
      }
      setProfileCompleted(completed);
      setProfileCheckError(null);
    } catch (error) {
      if (__DEV__) console.log('[Auth] profile fetch failed', error);
      setProfileCheckError(PROFILE_CHECK_ERROR_MESSAGE);
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const [onboardingDone, sessionResult] = await Promise.all([
        getOnboardingCompleted(),
        supabase.auth.getSession(),
      ]);
      if (!mounted) return;
      setOnboardingCompleted(onboardingDone);
      const currentSession = sessionResult.data.session;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        setLoadingProfile(true);
        setProfileCheckError(null);
        try {
          if (__DEV__) console.log('[Auth] profile check userId', currentSession.user.id);
          const profile = await fetchMyProfile(currentSession.user.id);
          const completed = isProfileComplete(profile);
          if (__DEV__) {
            console.log('[Auth] profile result', profile);
            console.log('[Auth] profile completed', completed);
          }
          if (!mounted) return;
          setProfileCompleted(completed);
          setProfileCheckError(null);
        } catch (error) {
          if (__DEV__) console.log('[Auth] profile fetch failed', error);
          if (!mounted) return;
          setProfileCheckError(PROFILE_CHECK_ERROR_MESSAGE);
        } finally {
          if (mounted) setLoadingProfile(false);
        }
      } else {
        setProfileCheckError(null);
      }
      if (mounted) setBootstrapReady(true);
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setProfileCompleted(false);
        setProfileCheckError(null);
        return;
      }

      setLoadingProfile(true);
      setProfileCheckError(null);
      try {
        if (__DEV__) console.log('[Auth] profile check userId', nextSession.user.id);
        const profile = await fetchMyProfile(nextSession.user.id);
        const completed = isProfileComplete(profile);
        if (__DEV__) {
          console.log('[Auth] profile result', profile);
          console.log('[Auth] profile completed', completed);
        }
        if (!mounted) return;
        setProfileCompleted(completed);
        setProfileCheckError(null);
      } catch (error) {
        if (__DEV__) console.log('[Auth] profile fetch failed', error);
        if (!mounted) return;
        setProfileCheckError(PROFILE_CHECK_ERROR_MESSAGE);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    });

    return () => {
      mounted = false;
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
