import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useRTLSetup } from '@/hooks/useRTLSetup';
import { AuthProvider, useAuth } from '@/lib/auth';

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { bootstrapReady, loadingProfile, user, onboardingCompleted, profileCompleted, profileCheckError, refreshProfile } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!bootstrapReady || loadingProfile) return;

    const rootGroup = segments[0];
    const leaf = segments.at(1);
    const inAuth = rootGroup === '(auth)';
    const inTabs = rootGroup === '(tabs)';
    const inProfileSetup = inAuth && leaf === 'profile-setup';
    const inOnboarding = inAuth && leaf === 'onboarding';
    const inLoginOrSignup = inAuth && (leaf === 'login' || leaf === 'signup');
    const inOAuthCallback = rootGroup === 'auth' && leaf === 'callback';

    if (inOAuthCallback && !user) {
      void SplashScreen.hideAsync();
      return;
    }

    if (!user) {
      if (!onboardingCompleted && !inOnboarding) {
        router.replace('/(auth)/onboarding');
      } else if (onboardingCompleted && !inLoginOrSignup) {
        router.replace('/(auth)/login');
      }
    } else if (profileCheckError) {
      void SplashScreen.hideAsync();
      return;
    } else if (!profileCompleted) {
      if (!inProfileSetup) router.replace('/(auth)/profile-setup');
    } else if (!inTabs) {
      router.replace('/(tabs)/home');
    }

    void SplashScreen.hideAsync();
  }, [bootstrapReady, loadingProfile, segments, user, onboardingCompleted, profileCompleted, profileCheckError, router]);

  if (!bootstrapReady || loadingProfile) return null;

  if (user && profileCheckError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>تعذر التحقق من بيانات الحساب.</Text>
        <Text style={styles.errorSubtitle}>حاول مرة تانية.</Text>
        <Pressable style={styles.retryButton} onPress={() => void refreshProfile()}>
          <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default function RootLayout() {
  useRTLSetup();
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
