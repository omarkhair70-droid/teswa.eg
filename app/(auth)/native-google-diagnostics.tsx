import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { signInWithGoogle, testGoogleBrowserOAuthForDiagnostics } from '@/lib/google-auth';
import * as GoogleNativeAuth from '@/lib/google-native-auth';
import type { GoogleNativeDiagnosticsEvent, NativeGoogleSignInResult } from '@/lib/google-native-auth';

const nativeTestModeEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE === 'true';

const EXPORTED_KEYS_SAFE_LIST = [
  'GOOGLE_NATIVE_AUTH_MODULE_VERSION',
  'GOOGLE_NATIVE_AUTH_IMPLEMENTATION',
  'getGoogleNativeAuthModuleInfo',
  'logGoogleSignInDiagnostic',
  'signInWithGoogleNative',
];

function toBooleanText(value: unknown) {
  if (typeof value === 'boolean') return String(value);
  return '—';
}

export default function NativeGoogleDiagnosticsScreen() {
  const [runningNative, setRunningNative] = useState(false);
  const [runningBrowser, setRunningBrowser] = useState(false);
  const [runningProduction, setRunningProduction] = useState(false);
  const [events, setEvents] = useState<GoogleNativeDiagnosticsEvent[]>([]);
  const moduleInfo = GoogleNativeAuth.getGoogleNativeAuthModuleInfo?.();
  const exportedKeys = Object.keys(GoogleNativeAuth).filter((key) => EXPORTED_KEYS_SAFE_LIST.includes(key));

  const [result, setResult] = useState<(NativeGoogleSignInResult & { supabaseHasError?: boolean; hasUser?: boolean; hasIdToken?: boolean }) | null>(null);
  const [browserResult, setBrowserResult] = useState<{ error: string | null } | null>(null);
  const [productionFlowResult, setProductionFlowResult] = useState<{ error: string | null } | null>(null);

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const webClientIdSuffix = webClientId ? webClientId.slice(-8) : null;

  const safeErrorText = useMemo(() => {
    if (!result) return '—';
    if (!result.error) return 'لا يوجد خطأ';
    return result.error;
  }, [result]);

  const runNativeTest = async () => {
    if (runningNative) return;
    setRunningNative(true);
    setEvents([]);
    setResult(null);
    setEvents((prev) => [...prev, { flow: 'native_step', step: 'diagnostics_button_pressed' }]);
    setEvents((prev) => [
      ...prev,
      { flow: 'native_step', step: 'module_info_observed', implementation: moduleInfo?.implementation, moduleVersion: moduleInfo?.moduleVersion, platform: Platform.OS },
    ]);

    try {
      const nextResult = await GoogleNativeAuth.signInWithGoogleNative({
        onStep: (event) => {
          setEvents((prev) => [...prev, event]);
          if (event.step === 'supabase_id_token_result') {
            setResult((prevResult) => ({ ...prevResult, supabaseHasError: event.hasError } as NativeGoogleSignInResult & { supabaseHasError?: boolean }));
          }
          if (event.step === 'native_signin_resolved') {
            setResult((prevResult) => ({ ...prevResult, resultType: event.resultType } as NativeGoogleSignInResult));
          }
          if (event.step === 'native_result_success') {
            setResult((prevResult) => ({ ...prevResult, hasIdToken: true, hasUser: true } as NativeGoogleSignInResult & { hasUser?: boolean; hasIdToken?: boolean }));
          }
          if (event.step === 'native_missing_id_token') {
            setResult((prevResult) => ({ ...prevResult, hasIdToken: false } as NativeGoogleSignInResult & { hasIdToken?: boolean }));
          }
        },
      });
      setResult(nextResult);
    } catch (error: unknown) {
      const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : undefined;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_catch', message }]);
      setResult({ status: 'error', error: 'حدث خطأ غير متوقع أثناء اختبار Native Google.', reason: 'native_exception', message, fallbackToBrowser: true });
    } finally {
      setRunningNative(false);
    }
  };

  if (!nativeTestModeEnabled) {
    return (
      <AppScreen>
        <View style={styles.card}>
          <AppText style={styles.title}>تشخيص Native Google</AppText>
          <AppText>وضع الاختبار غير مفعّل. فعّل EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE='true'.</AppText>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable>
      <View style={styles.wrap}>
        <AppText style={styles.title}>تشخيص Native Google</AppText>

        <View style={styles.card}>
          <AppText style={styles.subhead}>Environment flags</AppText>
          <AppText>EXPO_PUBLIC_GOOGLE_NATIVE_ENABLED: {process.env.EXPO_PUBLIC_GOOGLE_NATIVE_ENABLED ?? '—'}</AppText>
          <AppText>EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE: {process.env.EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE ?? '—'}</AppText>
          <AppText>has EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: {String(Boolean(webClientId))}</AppText>
          <AppText>web client suffix: {webClientIdSuffix ?? '—'}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>Platform/app info</AppText>
          <AppText>Platform.OS: {Platform.OS}</AppText>
          <AppText>expected package: com.teswa.mobile</AppText>
          <AppText>moduleVersion: {moduleInfo?.moduleVersion ?? '—'}</AppText>
          <AppText>moduleImplementation: {moduleInfo?.implementation ?? '—'}</AppText>
          <AppText>typeof signInWithGoogleNative: {typeof GoogleNativeAuth.signInWithGoogleNative}</AppText>
          <AppText>exportedKeys: {exportedKeys.length ? exportedKeys.join(', ') : '—'}</AppText>
        </View>

        <AppButton label={runningNative ? 'جاري اختبار Native...' : 'اختبار Native Google'} onPress={runNativeTest} disabled={runningNative} />
        <AppButton
          label={runningBrowser ? 'جاري اختبار Browser...' : 'Test Browser Google'}
          onPress={async () => {
            if (runningBrowser) return;
            setRunningBrowser(true);
            setBrowserResult(await testGoogleBrowserOAuthForDiagnostics());
            setRunningBrowser(false);
          }}
          disabled={runningBrowser}
        />
        <AppButton
          label={runningProduction ? 'جاري اختبار الإنتاج...' : 'Test Production Google Flow'}
          onPress={async () => {
            if (runningProduction) return;
            setRunningProduction(true);
            setProductionFlowResult(await signInWithGoogle());
            setRunningProduction(false);
          }}
          disabled={runningProduction}
        />

        <View style={styles.card}>
          <AppText style={styles.subhead}>Native Google configuration</AppText>
          <AppText>hasNativeModule: {String(typeof GoogleNativeAuth.signInWithGoogleNative === 'function')}</AppText>
          <AppText>hasGoogleSigninConfigure: {String(events.some((e) => e.step === 'google_configure_done'))}</AppText>
          <AppText>hasGoogleSigninSignIn: {String(events.some((e) => e.step === 'native_signin_start'))}</AppText>
          <AppText>hasGoogleSigninHasPlayServices: {String(events.some((e) => e.step === 'play_services_check_start'))}</AppText>
          <AppText>configured: {toBooleanText(events.findLast((e) => e.step === 'google_configure_done')?.configured)}</AppText>
          <AppText>hasWebClientId: {toBooleanText(events.findLast((e) => e.step === 'google_configure_done')?.hasWebClientId)}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>Final result</AppText>
          <AppText>status: {result?.status ?? '—'}</AppText>
          <AppText>reason: {result?.reason ?? '—'}</AppText>
          <AppText>fallbackToBrowser: {result ? String(Boolean(result.fallbackToBrowser)) : '—'}</AppText>
          <AppText>implementation: {result?.implementation ?? '—'}</AppText>
          <AppText>moduleVersion: {result?.moduleVersion ?? '—'}</AppText>
          <AppText>code: {result?.code ?? '—'}</AppText>
          <AppText>message: {result?.message ?? '—'}</AppText>
          <AppText>resultType: {result?.resultType ?? '—'}</AppText>
          <AppText>hasIdToken: {result ? String(Boolean(result.hasIdToken)) : '—'}</AppText>
          <AppText>hasUser: {result ? String(Boolean(result.hasUser)) : '—'}</AppText>
          <AppText>supabaseHasError: {result ? String(Boolean(result.supabaseHasError)) : '—'}</AppText>
          <AppText>error: {safeErrorText}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>Browser test result</AppText>
          <AppText>error: {browserResult?.error ?? '—'}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>Production flow test result</AppText>
          <AppText>error: {productionFlowResult?.error ?? '—'}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>Step timeline (Live)</AppText>
          {events.length === 0 ? <AppText>لا توجد خطوات بعد.</AppText> : null}
          {events.map((event, index) => (
            <AppText key={`${event.step}-${index}`} style={styles.eventLine}>
              {index + 1}. {event.step}
            </AppText>
          ))}
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700' },
  subhead: { fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  card: { gap: spacing.xs, borderWidth: 1, borderColor: 'rgba(221,208,197,0.9)', borderRadius: 12, padding: spacing.md },
  eventLine: { fontSize: 13 },
});
