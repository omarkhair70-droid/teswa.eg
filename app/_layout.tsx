import { useEffect, useRef } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useRTLSetup } from '@/hooks/useRTLSetup';
import { AuthProvider, useAuth } from '@/lib/auth';
import { navigateFromNotificationResponse, syncPushDeviceRegistrationIfPermitted } from '@/lib/push-notifications';
import { UnreadBadgesProvider } from '@/lib/unread-badges';
import { setPendingInboundSharedMedia } from '@/lib/inbound-shared-media';
import { ensureTeswaBackgroundMemoryRefreshRegistered } from '@/lib/background-memory-refresh';
import { createForegroundMemoryRefreshSubscription } from '@/lib/foreground-memory-refresh';

void SplashScreen.preventAutoHideAsync();



function ShareIntentCoordinator() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();

  useEffect(() => {
    if (error && __DEV__) {
      console.log('[share-intent] inbound share intent error', {
        message: (error as { message?: string })?.message,
      });
    }
  }, [error]);

  useEffect(() => {
    if (!hasShareIntent) return;

    const sharedFiles = shareIntent?.files ?? [];
    const sharedImageAssets: ImagePickerAsset[] = sharedFiles
      .filter((file) => typeof file?.mimeType === 'string' && file.mimeType.startsWith('image/'))
      .map((file, index) => {
        const uri = file.path || '';
        return {
          assetId: null,
          base64: null,
          duration: null,
          exif: null,
          fileName: file.fileName ?? `shared-image-${Date.now()}-${index}`,
          fileSize: file.size ?? undefined,
          height: file.height ?? 0,
          mimeType: file.mimeType ?? null,
          type: 'image' as const,
          uri,
          width: file.width ?? 0,
        };
      })
      .filter((asset) => !!asset.uri);

    if (sharedImageAssets.length) {
      setPendingInboundSharedMedia(sharedImageAssets);
      router.push({ pathname: '/(tabs)/add', params: { sharedIntent: String(Date.now()) } });
    }

    void resetShareIntent();
  }, [hasShareIntent, resetShareIntent, router, shareIntent]);

  return null;
}


function BackgroundMemoryRefreshCoordinator() {
  useEffect(() => {
    void ensureTeswaBackgroundMemoryRefreshRegistered();
  }, []);

  return null;
}


function ForegroundMemoryRefreshCoordinator() {
  useEffect(() => {
    const subscription = createForegroundMemoryRefreshSubscription();
    return () => subscription.remove();
  }, []);

  return null;
}

function RootNavigator() {
  const { bootstrapReady, loadingProfile, user, onboardingCompleted, profileCompleted, profileCheckError, refreshProfile } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const handledNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!bootstrapReady || loadingProfile || !user || !profileCompleted) return;
    void syncPushDeviceRegistrationIfPermitted(user.id);
  }, [bootstrapReady, loadingProfile, profileCompleted, user]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromNotificationResponse(response, handledNotificationIdsRef.current);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      navigateFromNotificationResponse(response, handledNotificationIdsRef.current);
    }).catch(() => undefined);

    return () => sub.remove();
  }, []);


  useEffect(() => {
    if (!bootstrapReady || loadingProfile) return;

    const rootGroup = segments[0];
    const leaf = segments.at(1);
    const inAuth = rootGroup === '(auth)';
    const atRoot = !rootGroup;
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
    } else if (inAuth || atRoot) {
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
  gestureRoot: {
    flex: 1,
  },
});

export default function RootLayout() {
  useRTLSetup();
  return (
    <ShareIntentProvider>
      <KeyboardProvider preload={false}>
        <GestureHandlerRootView style={styles.gestureRoot}>
        <AuthProvider>
          <UnreadBadgesProvider>
            <ShareIntentCoordinator />
            <BackgroundMemoryRefreshCoordinator />
            <ForegroundMemoryRefreshCoordinator />
            <RootNavigator />
          </UnreadBadgesProvider>
        </AuthProvider>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </ShareIntentProvider>
  );
}
