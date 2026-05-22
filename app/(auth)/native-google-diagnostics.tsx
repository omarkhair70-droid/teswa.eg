import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import {
  GoogleNativeDiagnosticsEvent,
  setGoogleNativeDiagnosticsListener,
  signInWithGoogleNative,
} from '@/lib/google-native-auth';

const nativeTestModeEnabled = process.env.EXPO_PUBLIC_GOOGLE_NATIVE_TEST_MODE === 'true';

export default function NativeGoogleDiagnosticsScreen() {
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<GoogleNativeDiagnosticsEvent[]>([]);
  const [result, setResult] = useState<{ error: string | null; fallbackToBrowser?: boolean; reason?: string } | null>(null);

  useEffect(() => {
    if (!nativeTestModeEnabled) return;

    setGoogleNativeDiagnosticsListener((event) => {
      setEvents((prev) => [...prev, event]);
    });

    return () => setGoogleNativeDiagnosticsListener(null);
  }, []);

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
    const nextResult = await signInWithGoogleNative();
    setResult(nextResult);
    setRunning(false);
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
          <AppText>error: {safeErrorText}</AppText>
          <AppText>fallbackToBrowser: {result ? String(Boolean(result.fallbackToBrowser)) : '—'}</AppText>
          <AppText>reason: {result?.reason ?? '—'}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.subhead}>الخطوات (Live)</AppText>
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
