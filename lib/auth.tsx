import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { fetchMyProfile, isProfileComplete } from '@/lib/profiles';
import { getOnboardingCompleted } from '@/lib/onboarding';

type AuthContextValue = {
  bootstrapReady: boolean;
  loadingProfile: boolean;
  session: Session | null;
  user: User | null;
  onboardingCompleted: boolean;
  profileCompleted: boolean;
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

  const refreshProfile = async () => {
    if (!user) {
      setProfileCompleted(false);
      return;
    }
    setLoadingProfile(true);
    try {
      const profile = await fetchMyProfile(user.id);
      setProfileCompleted(isProfileComplete(profile));
    } catch {
      setProfileCompleted(false);
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
        try {
          const profile = await fetchMyProfile(currentSession.user.id);
          if (!mounted) return;
          setProfileCompleted(isProfileComplete(profile));
        } catch {
          if (!mounted) return;
          setProfileCompleted(false);
        }
      }
      if (mounted) setBootstrapReady(true);
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setProfileCompleted(false);
        return;
      }

      try {
        const profile = await fetchMyProfile(nextSession.user.id);
        if (!mounted) return;
        setProfileCompleted(isProfileComplete(profile));
      } catch {
        if (!mounted) return;
        setProfileCompleted(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);


  const value = useMemo(
    () => ({ bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted, refreshProfile, setOnboardingCompletedState: setOnboardingCompleted }),
    [bootstrapReady, loadingProfile, session, user, onboardingCompleted, profileCompleted],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
