import { useEffect, useRef, useState } from 'react';
import type { ImagePickerAsset } from 'expo-image-picker';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from '@/lib/share-intent-compat';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { useRTLSetup } from '@/hooks/useRTLSetup';
import { AuthProvider, useAuth } from '@/lib/auth';
import { getRouteFromNotificationResponse } from '@/lib/push-notifications';
import { UnreadBadgesProvider } from '@/lib/unread-badges';
import { setPendingInboundSharedMedia } from '@/lib/inbound-shared-media';
import { BiometricAppLockCoordinator } from '@/components/security/BiometricAppLockCoordinator';
import { trackEvent } from '@/lib/analytics';
import { startupTiming, startupTrace } from '@/lib/startup-trace';
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { queryClient } from '@/lib/query/query-client';
import { getAdventureEntranceSeen } from '@/lib/adventure-entrance';



function ReactQueryRuntimeCoordinator({ enableNetworkProbe }: { enableNetworkProbe: boolean }) {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enableNetworkProbe) return;
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const applyNetworkState = async () => {
      try {
        const Network = await import('expo-network');
        const state = await Network.getNetworkStateAsync();
        if (!mounted) return;
        onlineManager.setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
      } catch (error) {
        if (__DEV__) {
          console.log('[ReactQuery]', 'network_state_probe_failed', {
            message: (error as { message?: string })?.message,
          });
        }
      }
    };

    void applyNetworkState();
    intervalId = setInterval(() => {
      void applyNetworkState();
    }, 30_000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [enableNetworkProbe]);

  return null;
}

const rootStartedAt = Date.now();
const startupLog = (event: string, data?: Record<string, unknown>) => {
  console.log('[StartupTiming]', event, { dtMs: Date.now() - rootStartedAt, ...data });
};
const policyRouteLog = (decision: 'show_policy' | 'skip_policy' | 'wait_for_session') => {
  console.log('[PolicyConsent]', 'route_decision', { decision });
};

startupLog('js_root_layout_started');
void SplashScreen.preventAutoHideAsync();

async function hideSplashSafely(_reason: string) {
  try {
    await SplashScreen.hideAsync();
    startupLog('splash_hidden', { reason: _reason });
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



const ACCOUNT_STATE_CHECK_STALL_TIMEOUT_MS = 6_000;
const DEFERRED_PUSH_SYNC_DELAY_MS = 7_000;
const DEFERRED_STARTUP_WORK_DELAY_MS = 2_000;
const nativeGoogleTestModeEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE === 'true';

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

function RootNavigator({ onFirstScreenReady }: { onFirstScreenReady?: () => void }) {
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
  const markedInitialRouteRef = useRef(false);
  const markedFirstScreenReadyRef = useRef(false);
  const loggedStartupHoldingScreenRef = useRef(false);
  const loggedAccountGateHoldingScreenRef = useRef(false);

  const retryAccountStateChecks = async () => {
    const shouldRefreshProfile = loadingProfile || profileCheckError;
    const shouldRefreshPolicy = loadingPolicyAcceptance || policyAcceptanceCheckError;

    setAccountStateCheckStalled(false);
    startupLog('account_gate_retry');

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
      startupLog('account_gate_blocked_pending_server');
    }, ACCOUNT_STATE_CHECK_STALL_TIMEOUT_MS);

    return () => clearTimeout(stallTimer);
  }, [user, loadingProfile, loadingPolicyAcceptance]);
  useEffect(() => {
    if (!user?.id || !markedFirstScreenReadyRef.current) return;
    void trackEvent('session_started', { route: '/_layout' });
  }, [user?.id, hasSatisfiedAccountGate]);

  useEffect(() => {
    if (!bootstrapReady || !hasSatisfiedAccountGate || !user?.id) return;
    const userIdAtSchedule = user.id;
    const timer = setTimeout(() => {
      if (!user?.id || user.id !== userIdAtSchedule) return;
      void import('@/lib/push-notifications').then(({ syncPushDeviceRegistrationIfPermitted }) => {
        return syncPushDeviceRegistrationIfPermitted(user.id);
      }).then((result) => {
        if (__DEV__) console.log('[Push] deferred post-login sync result', result);
      }).catch(() => undefined);
    }, DEFERRED_PUSH_SYNC_DELAY_MS);

    return () => clearTimeout(timer);
  }, [bootstrapReady, hasSatisfiedAccountGate, user?.id]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      startupLog('splash_watchdog_elapsed_without_forced_hide');
    }, 3_000);

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
    startupLog('initial_route_decision_ready', { hasUser: Boolean(user), profileCompleted, requiredPoliciesAccepted });
    if (!markedInitialRouteRef.current) {
      markedInitialRouteRef.current = true;
      startupTiming.mark('initial_route_decided', { hasUser: Boolean(user), profileCompleted, requiredPoliciesAccepted });
    }
    void hideSplashSafely('bootstrap_ready');
  }, [bootstrapReady]);

  useEffect(() => {
    if (!bootstrapReady) return;
    if (markedFirstScreenReadyRef.current) return;
    if (user && (loadingProfile || loadingPolicyAcceptance) && !hasSatisfiedAccountGate) return;
    markedFirstScreenReadyRef.current = true;
    startupTiming.mark('first_screen_ready', {
      hasUser: Boolean(user),
      profileCompleted,
      requiredPoliciesAccepted,
    });
    startupLog('first_screen_ready_signal');
    onFirstScreenReady?.();
    void hideSplashSafely('first_screen_ready');
  }, [bootstrapReady, hasSatisfiedAccountGate, loadingPolicyAcceptance, loadingProfile, profileCompleted, requiredPoliciesAccepted, user]);

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
      policyRouteLog('wait_for_session');
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
    const inNativeGoogleDiagnostics = inAuth && leaf === 'native-google-diagnostics';
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
    if (inNativeGoogleDiagnostics) {
      if (nativeGoogleTestModeEnabled) return;
      router.replace('/(auth)/login');
      return;
    }

    if (!user) {
      let cancelled = false;
      void (async () => {
        const hasSeenAdventure = await getAdventureEntranceSeen().catch(() => true);
        if (cancelled) return;
        if (!hasSeenAdventure) {
          if (!(inAuth && leaf === 'adventure')) router.replace('/(auth)/adventure');
          return;
        }
        if (!onboardingCompleted && !inOnboarding) {
          router.replace('/(auth)/onboarding');
        } else if (onboardingCompleted && !inLoginOrSignup) {
          router.replace('/(auth)/login');
        }
      })();
      return () => {
        cancelled = true;
      };
    } else if (profileCheckError) {
      void SplashScreen.hideAsync();
      return;
    } else if (!profileCompleted) {
      if (!inProfileSetup) router.replace('/(auth)/profile-setup');
    } else if (policyAcceptanceCheckError) {
      void SplashScreen.hideAsync();
      return;
    } else if (!requiredPoliciesAccepted) {
      policyRouteLog('show_policy');
      if (!inPolicyAcceptance) router.replace('/(auth)/policy-acceptance');
    } else if ((inAuth && !inPolicyAcceptance) || atRoot) {
      policyRouteLog('skip_policy');
      router.replace('/(tabs)/home');
    }
  }, [bootstrapReady, hasSatisfiedAccountGate, loadingProfile, loadingPolicyAcceptance, segments, user, onboardingCompleted, profileCompleted, profileCheckError, requiredPoliciesAccepted, policyAcceptanceCheckError, router, usingCachedAccountGate]);

  if (!bootstrapReady) {
    if (!loggedStartupHoldingScreenRef.current) {
      loggedStartupHoldingScreenRef.current = true;
      startupLog('startup_holding_screen_shown', { stage: 'bootstrap_not_ready' });
    }
    return (
      <AccountGateLoadingState
        title="تِسوى"
        subtitle=""
      />
    );
  }

  if (user && (loadingProfile || loadingPolicyAcceptance) && !hasSatisfiedAccountGate && !usingCachedAccountGate) {
    if (!loggedAccountGateHoldingScreenRef.current) {
      loggedAccountGateHoldingScreenRef.current = true;
      startupLog('startup_holding_screen_shown', { stage: 'account_gate_loading' });
    }
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
        title="بنجهز حسابك..."
        subtitle="ثواني ونراجع حالة حسابك."
      />
    );
  }

  if (user && (profileCheckError || policyAcceptanceCheckError) && (!profileCompleted || !requiredPoliciesAccepted)) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>تعذر التحقق من حسابك والسياسات. حاول مرة تانية.</Text>
        <Pressable style={styles.retryButton} onPress={() => void retryAccountStateChecks()}>
          <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}


function DeferredStartupWorkCoordinator({ firstScreenReady }: { firstScreenReady: boolean }) {
  useEffect(() => {
    if (!firstScreenReady) return;
    startupLog('deferred_startup_work_scheduled', { delayMs: DEFERRED_STARTUP_WORK_DELAY_MS });

    let cancelled = false;
    let foregroundCleanup: (() => void) | null = null;

    const timer = setTimeout(() => {
      startupLog('deferred_startup_work_started');
      void (async () => {
        try {
          const [{ ensureTeswaBackgroundMemoryRefreshRegistered }, foregroundModule] = await Promise.all([
            import('@/lib/background-memory-refresh'),
            import('@/lib/foreground-memory-refresh'),
          ]);

          if (cancelled) return;
          await ensureTeswaBackgroundMemoryRefreshRegistered();
          if (cancelled) return;

          const subscription = foregroundModule.createForegroundMemoryRefreshSubscription();
          foregroundCleanup = () => subscription.remove();

          if (AppState.currentState === 'active') {
            void foregroundModule.runForegroundMemoryRefreshIfAllowed('manual_bootstrap');
          }
        } finally {
          startupLog('deferred_startup_work_done');
        }
      })();
    }, DEFERRED_STARTUP_WORK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      foregroundCleanup?.();
    };
  }, [firstScreenReady]);

  return null;
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
  const [firstScreenReady, setFirstScreenReady] = useState(false);
  useEffect(() => {
    startupTiming.mark('root_layout_mounted');
  }, []);
  return (
    <ShareIntentProvider>
      <KeyboardProvider preload={false}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <BottomSheetModalProvider>
            <AuthProvider>
              <QueryClientProvider client={queryClient}>
                <UnreadBadgesProvider>
                  <ReactQueryRuntimeCoordinator enableNetworkProbe={firstScreenReady} />
                  <ShareIntentCoordinator />
                  <RootNavigator onFirstScreenReady={() => setFirstScreenReady(true)} />
                  <DeferredStartupWorkCoordinator firstScreenReady={firstScreenReady} />
                  <BiometricAppLockCoordinator />
                </UnreadBadgesProvider>
              </QueryClientProvider>
            </AuthProvider>
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </ShareIntentProvider>
  );
}
