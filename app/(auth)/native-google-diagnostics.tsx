import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import * as GoogleNativeAuth from '@/lib/google-native-auth-v2';
import type { GoogleNativeDiagnosticsEvent } from '@/lib/google-native-auth-v2';

const nativeTestModeEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE === 'true';

const EXPORTED_KEYS_SAFE_LIST = [
  'GOOGLE_NATIVE_AUTH_MODULE_VERSION',
  'GOOGLE_NATIVE_AUTH_IMPLEMENTATION',
  'getGoogleNativeAuthModuleInfo',
  'logGoogleSignInDiagnostic',
  'signInWithGoogleNative',
  'setGoogleNativeDiagnosticsListener',
];

export default function NativeGoogleDiagnosticsScreen() {
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<GoogleNativeDiagnosticsEvent[]>([]);
  const moduleInfo = GoogleNativeAuth.getGoogleNativeAuthModuleInfo?.();
  const exportedKeys = Object.keys(GoogleNativeAuth).filter((key) => EXPORTED_KEYS_SAFE_LIST.includes(key));

  const [result, setResult] = useState<{
    status: 'success' | 'cancelled' | 'fallback' | 'error' | 'empty' | 'timeout';
    error: string | null;
    reason?: string;
    fallbackToBrowser?: boolean;
    code?: string;
    message?: string;
    implementation?: 'android-native' | 'web-shim' | 'unknown';
    moduleVersion?: string;
  } | null>(null);

  const safeErrorText = useMemo(() => {
    if (!result) return '—';
    if (!result.error) return 'لا يوجد خطأ';
    return result.error;
  }, [result]);

  const runNativeTest = async () => {
    if (running) return;
    setRunning(true);
    setEvents([]);
    setResult(null);
    setEvents((prev) => [...prev, { flow: 'native_step', step: 'diagnostics_button_pressed' }]);
    setEvents((prev) => [
      ...prev,
      {
        flow: 'native_step',
        step: 'module_info_observed',
        implementation: moduleInfo?.implementation,
        moduleVersion: moduleInfo?.moduleVersion,
      },
    ]);

    if (typeof GoogleNativeAuth.signInWithGoogleNative !== 'function') {
      const typeofValue = typeof GoogleNativeAuth.signInWithGoogleNative;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_helper_not_function', message: typeofValue }]);
      setResult({
        status: 'error',
        error: 'Native helper is not callable.',
        reason: 'native_helper_not_function',
        message: typeofValue,
        implementation: moduleInfo?.implementation,
        moduleVersion: moduleInfo?.moduleVersion,
      });
      setRunning(false);
      return;
    }

    setEvents((prev) => [...prev, { flow: 'native_step', step: 'calling_native_helper' }]);
    let didTimeout = false;
    let sawHelperEntry = false;
    let latestImplementation: 'android-native' | 'web-shim' | 'unknown' | undefined;
    let latestModuleVersion: string | undefined;

    const timeoutId = setTimeout(() => {
      didTimeout = true;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_timeout_no_result' }]);
      setResult({
        status: 'timeout',
        error: 'انتهت مهلة انتظار نتيجة Native Google.',
        reason: 'native_timeout_no_result',
        fallbackToBrowser: true,
        implementation: latestImplementation ?? moduleInfo?.implementation,
        moduleVersion: latestModuleVersion ?? moduleInfo?.moduleVersion,
      });
      setRunning(false);
    }, 10_000);

    try {
      const nextResult = await GoogleNativeAuth.signInWithGoogleNative({
        onStep: (event) => {
          if (event.step === 'native_helper_entered') sawHelperEntry = true;
          if (event.implementation) latestImplementation = event.implementation;
          if (event.moduleVersion) latestModuleVersion = event.moduleVersion;
          setEvents((prev) => [...prev, event]);
        },
      });

      if (didTimeout) return;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_helper_returned' }]);
      if (!nextResult || typeof nextResult.status !== 'string') {
        const emptyReason = sawHelperEntry ? 'native_helper_returned_empty' : 'native_helper_returned_before_entry';
        setEvents((prev) => [
          ...prev,
          {
            flow: 'native_step',
            step: 'native_helper_returned_empty',
            implementation: latestImplementation ?? moduleInfo?.implementation,
            moduleVersion: latestModuleVersion ?? moduleInfo?.moduleVersion,
          },
        ]);
        setResult({
          status: 'empty',
          error: 'لم يتم استلام نتيجة صالحة من Native Google.',
          reason: emptyReason,
          fallbackToBrowser: true,
          implementation: latestImplementation ?? moduleInfo?.implementation,
          moduleVersion: latestModuleVersion ?? moduleInfo?.moduleVersion,
        });
      } else {
        setResult({
          ...nextResult,
          implementation: nextResult.implementation ?? latestImplementation ?? moduleInfo?.implementation,
          moduleVersion: nextResult.moduleVersion ?? latestModuleVersion ?? moduleInfo?.moduleVersion,
        });
      }
    } catch (error: unknown) {
      if (didTimeout) return;
      const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : undefined;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_helper_threw', message }]);
      setResult({
        status: 'error',
        error: 'حدث خطأ غير متوقع أثناء اختبار Native Google.',
        reason: 'native_helper_threw',
        message,
        implementation: latestImplementation ?? moduleInfo?.implementation,
        moduleVersion: latestModuleVersion ?? moduleInfo?.moduleVersion,
      });
    } finally {
      clearTimeout(timeoutId);
      if (!didTimeout) setRunning(false);
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
          <AppText style={styles.subhead}>Module info</AppText>
          <AppText>moduleVersion: {moduleInfo?.moduleVersion ?? '—'}</AppText>
          <AppText>moduleImplementation: {moduleInfo?.implementation ?? '—'}</AppText>
          <AppText>typeofSignInWithGoogleNative: {typeof GoogleNativeAuth.signInWithGoogleNative}</AppText>
          <AppText>exportedKeys: {exportedKeys.length ? exportedKeys.join(', ') : '—'}</AppText>
        </View>
        <AppButton label={running ? 'جاري الاختبار...' : 'اختبار Native Google'} onPress={runNativeTest} disabled={running} />
        <View style={styles.card}>
          <AppText style={styles.subhead}>النتيجة النهائية</AppText>
          <AppText>status: {result?.status ?? '—'}</AppText>
          <AppText>error: {safeErrorText}</AppText>
          <AppText>fallbackToBrowser: {result ? String(Boolean(result.fallbackToBrowser)) : '—'}</AppText>
          <AppText>reason: {result?.reason ?? '—'}</AppText>
          <AppText>code: {result?.code ?? '—'}</AppText>
          <AppText>message: {result?.message ?? '—'}</AppText>
          <AppText>implementation: {result?.implementation ?? '—'}</AppText>
          <AppText>moduleVersion: {result?.moduleVersion ?? '—'}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>الخطوات (Live)</AppText>
          {events.length === 0 ? <AppText>لا توجد خطوات بعد.</AppText> : null}
          {events.map((event, index) => (
            <AppText key={`${event.step}-${index}`} style={styles.eventLine}>
              {index + 1}. {event.step}
              {event.platform ? ` | platform=${event.platform}` : ''}
              {event.implementation ? ` | implementation=${event.implementation}` : ''}
              {event.moduleVersion ? ` | moduleVersion=${event.moduleVersion}` : ''}
              {typeof event.configured === 'boolean' ? ` | configured=${String(event.configured)}` : ''}
              {event.resultType ? ` | resultType=${event.resultType}` : ''}
              {event.code ? ` | code=${event.code}` : ''}
              {event.message ? ` | message=${event.message}` : ''}
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
