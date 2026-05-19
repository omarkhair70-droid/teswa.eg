import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { recordRequiredPolicyAcceptances } from '@/lib/policy-acceptance';

export default function PolicyAcceptanceScreen() {
  const router = useRouter();
  const { user, refreshPolicyAcceptance } = useAuth();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptGuidelines, setAcceptGuidelines] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = acceptTerms && acceptGuidelines && !submitting;

  const submit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    setError('');
    const result = await recordRequiredPolicyAcceptances(user.id);
    if (!result.ok) {
      setSubmitting(false);
      setError(result.message);
      return;
    }

    await refreshPolicyAcceptance();
    setSubmitting(false);
    router.replace('/(tabs)/home');
  };

  return (
    <AppScreen backgroundVariant="alive" scrollable>
      <AuthExperienceShell
        icon="shield-checkmark-outline"
        eyebrow="قبل ما تكمل"
        title="تِسوى مبنية على الثقة"
        body="قبل استخدام ميزات النشر والتفاعل، راجع شروط الاستخدام وإرشادات المجتمع ووافق عليها."
      >
        <View style={styles.card}>
          <AppText style={styles.explainer}>الموافقة تساعدنا نحافظ على بيئة آمنة ومحترمة لكل المستخدمين.</AppText>
          <ToggleRow checked={acceptTerms} onPress={() => setAcceptTerms((prev) => !prev)} label="أوافق على شروط الاستخدام" />
          <Link href="/legal/terms" asChild><Pressable><AppText style={styles.link}>فتح شروط الاستخدام</AppText></Pressable></Link>

          <ToggleRow checked={acceptGuidelines} onPress={() => setAcceptGuidelines((prev) => !prev)} label="أوافق على إرشادات المجتمع" />
          <Link href="/legal/community-guidelines" asChild><Pressable><AppText style={styles.link}>فتح إرشادات المجتمع</AppText></Pressable></Link>

          <Link href="/legal/privacy" asChild><Pressable><AppText style={styles.secondaryLink}>سياسة الخصوصية</AppText></Pressable></Link>

          {Boolean(error) && <View style={styles.errorCard}><AppText style={styles.errorText}>{error}</AppText></View>}
          <AppButton label={submitting ? 'جاري الحفظ...' : 'أوافق وأكمل'} onPress={submit} disabled={!canSubmit} />
        </View>
      </AuthExperienceShell>
    </AppScreen>
  );
}

function ToggleRow({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.toggleRow}>
      <View style={[styles.check, checked && styles.checkActive]}>{checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}</View>
      <AppText style={styles.toggleLabel}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(221,208,197,0.9)', borderRadius: 18, padding: spacing.md, backgroundColor: 'rgba(255,253,248,0.92)' },
  explainer: { opacity: 0.85, lineHeight: 20, marginBottom: spacing.xs },
  toggleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkActive: { backgroundColor: '#111827', borderColor: '#111827' },
  toggleLabel: { flex: 1 },
  link: { color: '#1d4ed8', textDecorationLine: 'underline', marginBottom: spacing.xs },
  secondaryLink: { textAlign: 'center', marginVertical: spacing.xs },
  errorCard: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(179,38,30,0.25)', backgroundColor: 'rgba(255,240,239,0.9)', padding: spacing.sm },
  errorText: { color: '#B3261E', textAlign: 'center' },
});
