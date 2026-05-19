import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { completeGoogleOAuthFromUrl } from '@/lib/google-auth';

const CALLBACK_ERROR_MESSAGE = 'تعذر إكمال تسجيل الدخول بجوجل. حاول مرة تانية.';

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const linkingUrl = Linking.useLinkingURL();
  const callbackUrl = useMemo(() => (!linkingUrl ? null : linkingUrl.startsWith('teswa://auth/callback') ? linkingUrl : null), [linkingUrl]);

  useEffect(() => {
    if (!callbackUrl || callbackUrl === processedUrl) return;
    let cancelled = false;
    const complete = async () => {
      const result = await completeGoogleOAuthFromUrl(callbackUrl);
      if (cancelled) return;
      setProcessedUrl(callbackUrl);
      if (result.error) setError(result.error || CALLBACK_ERROR_MESSAGE);
      else setError(null);
    };
    void complete();
    return () => { cancelled = true; };
  }, [callbackUrl, processedUrl]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF3E1', '#F2DED1', '#E7F2EE']} style={styles.stage}>
        <View style={styles.iconShell}><Ionicons name={error ? 'shield-checkmark-outline' : 'logo-google'} size={30} color={colors.primary} /></View>
        {!error ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        <AppText weight="bold" style={styles.title}>{error ? 'تعذّر إكمال الدخول' : 'بنكمّل دخولك بأمان...'}</AppText>
        <AppText style={styles.subtitle}>{error ? 'حصلت مشكلة أثناء الربط. تقدر ترجع وتسجل دخولك من جديد.' : 'لحظة ونرجعك لتِسوى.'}</AppText>
        {error ? <View style={styles.errorCard}><AppText style={styles.errorText}>{error}</AppText></View> : null}
        {error ? <Pressable style={styles.backButton} onPress={() => router.replace('/(auth)/login')}><AppText style={styles.backText}>العودة لتسجيل الدخول</AppText></Pressable> : null}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: '#F9F3EA' },
  stage: { width: '100%', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(184,98,63,0.22)', alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  iconShell: { width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, textAlign: 'center' },
  subtitle: { textAlign: 'center', color: colors.textMuted },
  errorCard: { width: '100%', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(179,38,30,0.25)', backgroundColor: 'rgba(255,240,239,0.95)', padding: spacing.md },
  errorText: { color: '#B3261E', textAlign: 'center' },
  backButton: { marginTop: spacing.sm, borderWidth: 1, borderColor: 'rgba(184,98,63,0.4)', borderRadius: 14, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, backgroundColor: 'rgba(255,255,255,0.65)' },
  backText: { color: colors.primary },
});
