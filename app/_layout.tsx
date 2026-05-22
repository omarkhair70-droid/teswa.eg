import { useEffect, useRef, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from '@/lib/share-intent-compat';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useRTLSetup } from '@/hooks/useRTLSetup';
import { AuthProvider, useAuth } from '@/lib/auth';
import { getRouteFromNotificationResponse, syncPushDeviceRegistrationIfPermitted } from '@/lib/push-notifications';
import { UnreadBadgesProvider } from '@/lib/unread-badges';
import { setPendingInboundSharedMedia } from '@/lib/inbound-shared-media';
import { ensureTeswaBackgroundMemoryRefreshRegistered } from '@/lib/background-memory-refresh';
import { createForegroundMemoryRefreshSubscription } from '@/lib/foreground-memory-refresh';
import { BiometricAppLockCoordinator } from '@/components/security/BiometricAppLockCoordinator';
import { trackEvent } from '@/lib/analytics';
import { startupTrace } from '@/lib/startup-trace';

void SplashScreen.preventAutoHideAsync();

const SPLASH_FAILSAFE_TIMEOUT_MS = 1_200;

async function hideSplashSafely(_reason: string) {
  try {
    await SplashScreen.hideAsync();
  } catch {
    // noop
  }
}


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

const ACCOUNT_STATE_CHECK_STALL_TIMEOUT_MS = 11_000;

function AccountGateLoadingState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorSubtitle}>{subtitle}</Text>
    </View>
  );
}

function RootNavigator() {
  const { bootstrapReady, loadingProfile, user, onboardingCompleted, profileCompleted, profileCheckError, loadingPolicyAcceptance, requiredPoliciesAccepted, policyAcceptanceCheckError, refreshProfile, refreshPolicyAcceptance, usingCachedAccountGate } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const [accountStateCheckStalled, setAccountStateCheckStalled] = useState(false);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<string | null>(null);
  const hasSatisfiedAccountGate = Boolean(
    user?.id
    && profileCompleted
    && requiredPoliciesAccepted
    && !profileCheckError
    && !policyAcceptanceCheckError,
  );

  const retryAccountStateChecks = async () => {
    const shouldRefreshProfile = loadingProfile || profileCheckError;
    const shouldRefreshPolicy = loadingPolicyAcceptance || policyAcceptanceCheckError;

    setAccountStateCheckStalled(false);

    if (shouldRefreshProfile) await refreshProfile();
    if (shouldRefreshPolicy) await refreshPolicyAcceptance();
  };


  useEffect(() => {
    if (!user || (!loadingProfile && !loadingPolicyAcceptance)) {
      setAccountStateCheckStalled(false);
      return;
    }

    const stallTimer = setTimeout(() => {
      setAccountStateCheckStalled(true);
    }, ACCOUNT_STATE_CHECK_STALL_TIMEOUT_MS);

    return () => clearTimeout(stallTimer);
  }, [user, loadingProfile, loadingPolicyAcceptance]);
  useEffect(() => {
    if (!user?.id) return;
    void trackEvent('session_started', { route: '/_layout' });
  }, [user?.id]);

  useEffect(() => {
    if (!bootstrapReady || loadingProfile || !user || !profileCompleted) return;
    void syncPushDeviceRegistrationIfPermitted(user.id).then((result) => {
      if (__DEV__) console.log('[Push] post-login sync result', { userId: user.id, ...result });
    });
  }, [bootstrapReady, loadingProfile, profileCompleted, user]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void hideSplashSafely('startup_failsafe');
    }, SPLASH_FAILSAFE_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const queueNotificationRoute = (response: Notifications.NotificationResponse | null | undefined) => {
      const resolved = getRouteFromNotificationResponse(response);
      if (!resolved) return;
      if (handledNotificationIdsRef.current.has(resolved.id)) return;
      handledNotificationIdsRef.current.add(resolved.id);
      setPendingNotificationRoute(resolved.route);
    };

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      queueNotificationRoute(response);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      queueNotificationRoute(response);
    }).catch(() => undefined);

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!bootstrapReady) return;
    void hideSplashSafely('bootstrap_ready');
  }, [bootstrapReady]);

  useEffect(() => {
    if (!pendingNotificationRoute) return;
    if (!bootstrapReady || !user || !profileCompleted || !requiredPoliciesAccepted) return;
    if ((loadingProfile || loadingPolicyAcceptance) && !hasSatisfiedAccountGate) return;

    try {
      router.push(pendingNotificationRoute as never);
    } catch (error) {
      if (__DEV__) {
        console.warn('[push] navigation failed, falling back to /notifications', {
          message: (error as { message?: string })?.message,
        });
      }
      try {
        router.push('/notifications' as never);
      } catch {
        // noop
      }
    } finally {
      setPendingNotificationRoute(null);
    }
  }, [bootstrapReady, hasSatisfiedAccountGate, loadingPolicyAcceptance, loadingProfile, pendingNotificationRoute, profileCompleted, requiredPoliciesAccepted, router, user]);

  useEffect(() => {
    if (!bootstrapReady) {
      startupTrace.markRouteGuardWaitingReason('bootstrap_not_ready');
      return;
    }
    if ((loadingProfile || loadingPolicyAcceptance) && hasSatisfiedAccountGate && usingCachedAccountGate) {
      startupTrace.markRouteGuardWaitingReason('background_revalidation_with_cached_gate');
    }
    if ((loadingProfile || loadingPolicyAcceptance) && !hasSatisfiedAccountGate) {
      startupTrace.markRouteGuardWaitingReason('account_checks_loading_without_satisfied_gate');
      return;
    }

    const rootGroup = segments[0];
    const leaf = segments.at(1);
    const inAuth = rootGroup === '(auth)';
    const atRoot = !rootGroup;
    const inProfileSetup = inAuth && leaf === 'profile-setup';
    const inPolicyAcceptance = inAuth && leaf === 'policy-acceptance';
    const inOnboarding = inAuth && leaf === 'onboarding';
    const inLoginOrSignup = inAuth && (leaf === 'login' || leaf === 'signup');
    const inOAuthCallback = rootGroup === 'auth' && leaf === 'callback';
    const inPublicLegalRoute = rootGroup === 'legal' && (
      leaf === 'privacy'
      || leaf === 'terms'
      || leaf === 'community-guidelines'
    );
    const inPublicAccountDeletionRoute = rootGroup === 'account-deletion';
    const inPublicComplianceRoute = inPublicLegalRoute || inPublicAccountDeletionRoute;

    if (inOAuthCallback && !user) return;
    if (inPublicComplianceRoute) return;

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
    } else if (policyAcceptanceCheckError) {
      void SplashScreen.hideAsync();
      return;
    } else if (!requiredPoliciesAccepted) {
      if (!inPolicyAcceptance) router.replace('/(auth)/policy-acceptance');
    } else if ((inAuth && !inPolicyAcceptance) || atRoot) {
      router.replace('/(tabs)/home');
    }
  }, [bootstrapReady, hasSatisfiedAccountGate, loadingProfile, loadingPolicyAcceptance, segments, user, onboardingCompleted, profileCompleted, profileCheckError, requiredPoliciesAccepted, policyAcceptanceCheckError, router, usingCachedAccountGate]);

  if (!bootstrapReady) {
    return (
      <AccountGateLoadingState
        title="بنفتح تِسوى..."
        subtitle="ثواني ونجهز تجربتك."
      />
    );
  }

  if (user && (loadingProfile || loadingPolicyAcceptance) && !hasSatisfiedAccountGate) {
    if (accountStateCheckStalled) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>التحقق من حسابك يستغرق وقتًا أطول من المتوقع.</Text>
          <Text style={styles.errorSubtitle}>تقدر تعيد المحاولة الآن بدون إغلاق التطبيق.</Text>
          <Pressable style={styles.retryButton} onPress={() => void retryAccountStateChecks()}>
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <AccountGateLoadingState
        title="ندخلك إلى تِسوى..."
        subtitle="نراجع حالة حسابك بسرعة ونفتح لك التجربة."
      />
    );
  }

  if (user && (profileCheckError || policyAcceptanceCheckError) && (!profileCompleted || !requiredPoliciesAccepted)) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>تعذر التحقق من حالة حسابك.</Text>
        <Text style={styles.errorSubtitle}>حاول مرة تانية.</Text>
        <Pressable style={styles.retryButton} onPress={() => void retryAccountStateChecks()}>
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
            <BiometricAppLockCoordinator />
          </UnreadBadgesProvider>
        </AuthProvider>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </ShareIntentProvider>
  );
}
