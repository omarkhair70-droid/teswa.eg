import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useRTLSetup } from '@/hooks/useRTLSetup';
import { AuthProvider, useAuth } from '@/lib/auth';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { bootstrapReady, loadingProfile, user, onboardingCompleted, profileCompleted } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!bootstrapReady || loadingProfile) return;

    const rootGroup = segments[0];
    const leaf = segments[1];
    const inAuth = rootGroup === '(auth)';
    const inTabs = rootGroup === '(tabs)';
    const inProfileSetup = inAuth && leaf === 'profile-setup';
    const inOnboarding = inAuth && leaf === 'onboarding';
    const inLoginOrSignup = inAuth && (leaf === 'login' || leaf === 'signup');

    if (!user) {
      if (!onboardingCompleted && !inOnboarding) {
        router.replace('/(auth)/onboarding');
      } else if (onboardingCompleted && !inLoginOrSignup) {
        router.replace('/(auth)/login');
      }
    } else if (!profileCompleted) {
      if (!inProfileSetup) router.replace('/(auth)/profile-setup');
    } else if (!inTabs) {
      router.replace('/(tabs)/home');
    }

    void SplashScreen.hideAsync();
  }, [bootstrapReady, loadingProfile, segments, user, onboardingCompleted, profileCompleted, router]);

  if (!bootstrapReady || loadingProfile) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  useRTLSetup();
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
