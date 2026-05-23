import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import type { GoogleNativeDiagnosticsEvent } from '@/lib/google-native-auth';
import { signInWithGoogleNative } from '@/lib/google-native-auth';

const nativeTestModeEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE === 'true';

export default function NativeGoogleDiagnosticsScreen() {
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<GoogleNativeDiagnosticsEvent[]>([]);
  const [result, setResult] = useState<{
    status: 'success' | 'cancelled' | 'fallback' | 'error' | 'empty' | 'timeout';
    error: string | null;
    reason?: string;
    fallbackToBrowser?: boolean;
    code?: string;
    message?: string;
    implementation?: 'android-native' | 'web-shim' | 'unknown';
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
    setEvents((prev) => [...prev, { flow: 'native_step', step: 'calling_native_helper' }]);
    let didTimeout = false;
    let sawHelperEntry = false;
    let latestImplementation: 'android-native' | 'web-shim' | 'unknown' | undefined;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_timeout_no_result' }]);
      setResult({
        status: 'timeout',
        error: 'انتهت مهلة انتظار نتيجة Native Google.',
        reason: 'native_timeout_no_result',
        fallbackToBrowser: true,
      });
      setRunning(false);
    }, 10_000);
    try {
      const nextResult = await signInWithGoogleNative({
        onStep: (event) => {
          if (event.step === 'native_helper_entered') {
            sawHelperEntry = true;
          }
          if (event.implementation) {
            latestImplementation = event.implementation;
          }
          setEvents((prev) => [...prev, event]);
        },
      });
      if (didTimeout) return;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_helper_returned' }]);
      if (!nextResult || typeof nextResult.status !== 'string') {
        const emptyReason = sawHelperEntry ? 'native_helper_returned_empty' : 'native_helper_returned_before_entry';
        setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_helper_returned_empty', implementation: latestImplementation }]);
        setResult({
          status: 'empty',
          error: 'لم يتم استلام نتيجة صالحة من Native Google.',
          reason: emptyReason,
          fallbackToBrowser: true,
          implementation: latestImplementation,
        });
      } else {
        setResult(nextResult);
      }
    } catch (error: unknown) {
      if (didTimeout) return;
      const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : undefined;
      setEvents((prev) => [...prev, { flow: 'native_step', step: 'native_helper_threw', message }]);
      setResult({ status: 'error', error: 'حدث خطأ غير متوقع أثناء اختبار Native Google.', reason: 'native_helper_threw', message });
    } finally {
      clearTimeout(timeoutId);
      if (!didTimeout) {
        setRunning(false);
      }
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
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>الخطوات (Live)</AppText>
          {events.length === 0 ? <AppText>لا توجد خطوات بعد.</AppText> : null}
          {events.map((event, index) => (
            <AppText key={`${event.step}-${index}`} style={styles.eventLine}>
              {index + 1}. {event.step}
              {event.platform ? ` | platform=${event.platform}` : ''}
              {event.implementation ? ` | implementation=${event.implementation}` : ''}
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
