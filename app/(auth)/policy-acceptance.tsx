import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { AppButton } from '@/components/ui/AppButton';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { recordRequiredPolicyAcceptances } from '@/lib/policy-acceptance';

export default function PolicyAcceptanceScreen() {
  const router = useRouter();
  const { user, refreshPolicyAcceptance, markPolicyAcceptanceConfirmed } = useAuth();
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptGuidelines, setAcceptGuidelines] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = acceptTerms && acceptGuidelines && !submitting;

  const submit = async () => {
    if (!user || !canSubmit) return;
    const initialUserId = user.id;
    if (__DEV__) console.log('[Policy] submit start', { hasUser: Boolean(initialUserId) });
    setSubmitting(true);
    setError('');
    const result = await recordRequiredPolicyAcceptances(initialUserId);
    if (!result.ok) {
      setSubmitting(false);
      setError(result.message);
      return;
    }
    markPolicyAcceptanceConfirmed();
    setSubmitting(false);
    router.replace('/(tabs)/home');
    void refreshPolicyAcceptance();
  };

  return (
    <AppScreen backgroundVariant="alive" scrollable>
      <AuthExperienceShell
        icon="shield-checkmark-outline"
        eyebrow="قبل ما تدخل المجتمع"
        title="اتفاق واضح من البداية"
        body="راجع شروط الاستخدام وإرشادات المجتمع. الموافقة مطلوبة قبل النشر والتفاعل داخل تِسوى."
      >
        <View style={styles.introNote}>
          <Ionicons name="people-outline" size={19} color={colors.accent} />
          <AppText muted style={styles.introText}>القواعد دي معمولة عشان التبديل يفضل واضح وآمن ومحترم للطرفين.</AppText>
        </View>

        <PolicyChoice
          checked={acceptTerms}
          onPress={() => setAcceptTerms((prev) => !prev)}
          icon="document-text-outline"
          title="شروط الاستخدام"
          description="القواعد الأساسية لاستخدام الحساب، النشر، العروض والصفقات."
          href="/legal/terms"
          linkLabel="اقرأ الشروط"
        />

        <PolicyChoice
          checked={acceptGuidelines}
          onPress={() => setAcceptGuidelines((prev) => !prev)}
          icon="people-outline"
          title="إرشادات المجتمع"
          description="إيه المقبول في التواصل والمحتوى وإيه اللي ممكن يؤدي لبلاغ أو إجراء."
          href="/legal/community-guidelines"
          linkLabel="اقرأ الإرشادات"
        />

        <Link href="/legal/privacy" asChild>
          <Pressable accessibilityRole="link" style={({ pressed }) => [styles.privacyRow, pressed && styles.pressed]}>
            <View style={styles.privacyIcon}><Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} /></View>
            <View style={styles.privacyCopy}><AppText weight="semibold">سياسة الخصوصية</AppText><AppText muted style={styles.privacyDescription}>اعرف البيانات اللي بنستخدمها وليه.</AppText></View>
            <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
          </Pressable>
        </Link>

        {error ? <View style={styles.errorCard}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}

        <View style={styles.footerPanel}>
          <View style={styles.footerStatus}><Ionicons name={canSubmit ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={canSubmit ? colors.success : colors.textMuted} /><AppText muted style={styles.footerStatusText}>{acceptTerms && acceptGuidelines ? 'راجعت ووافقت على المطلوب.' : 'وافق على الوثيقتين عشان تكمل.'}</AppText></View>
          <AppButton label={submitting ? 'جاري الحفظ...' : 'أوافق وأدخل تِسوى'} onPress={submit} disabled={!canSubmit} loading={submitting} fullWidth />
        </View>
      </AuthExperienceShell>
    </AppScreen>
  );
}

function PolicyChoice({ checked, onPress, icon, title, description, href, linkLabel }: { checked: boolean; onPress: () => void; icon: keyof typeof Ionicons.glyphMap; title: string; description: string; href: '/legal/terms' | '/legal/community-guidelines'; linkLabel: string }) {
  return (
    <View style={[styles.choiceCard, checked && styles.choiceCardSelected]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.choiceMain}>
        <View style={[styles.choiceIcon, checked && styles.choiceIconSelected]}><Ionicons name={icon} size={20} color={checked ? colors.primary : colors.textMuted} /></View>
        <View style={styles.choiceCopy}><AppText weight="bold" style={styles.choiceTitle}>{title}</AppText><AppText muted style={styles.choiceDescription}>{description}</AppText></View>
        <View style={[styles.check, checked && styles.checkActive]}>{checked ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}</View>
      </Pressable>
      <Link href={href} asChild><Pressable accessibilityRole="link" style={styles.readLink}><AppText weight="semibold" style={styles.readLinkText}>{linkLabel}</AppText><Ionicons name="chevron-back" size={15} color={colors.primary} /></Pressable></Link>
    </View>
  );
}

const styles = StyleSheet.create({
  introNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  introText: { flex: 1, lineHeight: 19, textAlign: 'right' },
  choiceCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface, overflow: 'hidden' },
  choiceCardSelected: { borderColor: colors.primary, backgroundColor: '#FFF9F4' },
  choiceMain: { minHeight: 90, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  choiceIcon: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  choiceIconSelected: { backgroundColor: colors.primarySoft },
  choiceCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  choiceTitle: { fontSize: 15, textAlign: 'right' },
  choiceDescription: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  readLink: { minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 4, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  readLinkText: { color: colors.primary, fontSize: 11 },
  privacyRow: { minHeight: 64, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background },
  privacyIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  privacyCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  privacyDescription: { fontSize: 11 },
  errorCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.dangerSoft, padding: spacing.md },
  errorText: { flex: 1, color: colors.danger, textAlign: 'right', lineHeight: 19 },
  footerPanel: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  footerStatus: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  footerStatusText: { flex: 1, fontSize: 11, textAlign: 'right' },
  pressed: { opacity: 0.72 },
});
