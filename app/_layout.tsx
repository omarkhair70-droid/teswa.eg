import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useRTLSetup } from '@/hooks/useRTLSetup';
import { AuthProvider, useAuth } from '@/lib/auth';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { bootstrapReady, loadingProfile, user, onboardingCompleted, profileCompleted } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!bootstrapReady || loadingProfile) return;

    const inAuth = pathname.startsWith('/(auth)');
    const inTabs = pathname.startsWith('/(tabs)');

    if (!user) {
      if (!onboardingCompleted && pathname !== '/(auth)/onboarding') router.replace('/(auth)/onboarding');
      if (onboardingCompleted && pathname !== '/(auth)/login' && pathname !== '/(auth)/signup') router.replace('/(auth)/login');
    } else {
      if (!profileCompleted && pathname !== '/(auth)/profile-setup') router.replace('/(auth)/profile-setup');
      if (profileCompleted && !inTabs) router.replace('/(tabs)/home');
      if (inAuth && profileCompleted) router.replace('/(tabs)/home');
    }

    void SplashScreen.hideAsync();
  }, [bootstrapReady, loadingProfile, pathname, user, onboardingCompleted, profileCompleted]);

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
