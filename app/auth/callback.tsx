import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { completeGoogleOAuthFromUrl } from '@/lib/google-auth';

const CALLBACK_ERROR_MESSAGE = 'تعذر إكمال تسجيل الدخول بجوجل. حاول مرة تانية.';

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const linkingUrl = Linking.useLinkingURL();

  const callbackUrl = useMemo(() => {
    if (!linkingUrl) return null;
    return linkingUrl.startsWith('teswa://auth/callback') ? linkingUrl : null;
  }, [linkingUrl]);

  useEffect(() => {
    if (!callbackUrl || callbackUrl === processedUrl) return;

    let cancelled = false;

    const complete = async () => {
      const result = await completeGoogleOAuthFromUrl(callbackUrl);
      if (cancelled) return;

      setProcessedUrl(callbackUrl);
      if (result.error) {
        setError(result.error || CALLBACK_ERROR_MESSAGE);
      } else {
        setError(null);
      }
    };

    void complete();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, processedUrl]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#0066FF" />
      <Text style={styles.title}>جاري إكمال تسجيل الدخول...</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 16,
    textAlign: 'center',
    color: '#111827',
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
    color: '#B91C1C',
  },
});
