import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { accountDeletionContent, TESWA_SUPPORT_EMAIL } from '@/lib/legal-content';

const MAILTO_LINK = `mailto:${TESWA_SUPPORT_EMAIL}?subject=${encodeURIComponent(accountDeletionContent.emailSubject)}`;

const DELETE_COVERAGE = [
  'بيانات الحساب والملف الشخصي المرتبطة بالحساب.',
  'العناصر والقصص والمحتوى المرتبط بالحساب حسب عملية الحذف.',
  'الوسائط والبيانات المرتبطة بالتفاعل عندما ينطبق ذلك.',
];

export default function AccountDeletionRoute() {
  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText muted style={styles.eyebrow}>إدارة الحساب</AppText>
          <AppText weight="bold" style={styles.title}>حذف حساب تِسوى</AppText>
          <AppText muted style={styles.subtitle}>الحذف نهائي. قبل ما تبدأ، راجع اللي هيحصل واختار الطريقة المناسبة ليك.</AppText>
        </View>
      </View>

      <View style={styles.warningHero}>
        <View style={styles.warningIcon}><Ionicons name="trash-outline" size={24} color={colors.danger} /></View>
        <View style={styles.warningCopy}>
          <AppText weight="bold" style={styles.warningTitle}>لو هدفك توقف التنبيهات أو الرسائل، مش لازم تحذف الحساب</AppText>
          <AppText muted style={styles.warningText}>تقدر تعدّل الإشعارات وخصوصية الرسائل من الإعدادات. استخدم الحذف لما تكون عايز تنهي الحساب وبياناته فعلًا.</AppText>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}><Ionicons name="phone-portrait-outline" size={20} color={colors.primary} /></View>
          <View style={styles.sectionCopy}>
            <AppText muted style={styles.eyebrow}>الطريقة الأسرع</AppText>
            <AppText weight="bold" style={styles.sectionTitle}>احذف الحساب من داخل التطبيق</AppText>
          </View>
        </View>
        <AppText muted style={styles.sectionText}>من شاشة حسابك، انزل لإدارة الحساب واختار حذف الحساب. هتظهرلك خطوة تأكيد قبل التنفيذ النهائي.</AppText>
        <AppButton label="الذهاب إلى حسابي" onPress={() => router.replace('/(tabs)/profile')} />
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, styles.sectionIconAccent]}><Ionicons name="mail-outline" size={20} color={colors.accent} /></View>
          <View style={styles.sectionCopy}>
            <AppText muted style={styles.eyebrow}>بديل لو مش قادر تدخل الحساب</AppText>
            <AppText weight="bold" style={styles.sectionTitle}>اطلب الحذف بالبريد</AppText>
          </View>
        </View>
        <AppText muted style={styles.sectionText}>ابعت من بريدك المرتبط بالحساب، أو اكتب اسم المستخدم، ووضح إنك بتطلب حذف حساب تِسوى.</AppText>
        <Pressable accessibilityRole="button" onPress={() => Linking.openURL(MAILTO_LINK)} style={({ pressed }) => [styles.emailCard, pressed && styles.pressed]}>
          <View style={styles.emailIcon}><Ionicons name="paper-plane-outline" size={19} color={colors.primary} /></View>
          <View style={styles.emailCopy}>
            <AppText weight="semibold">{TESWA_SUPPORT_EMAIL}</AppText>
            <AppText muted style={styles.emailHint}>هنفتح تطبيق البريد بموضوع الطلب جاهز.</AppText>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.panel}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, styles.sectionIconNeutral]}><Ionicons name="layers-outline" size={20} color={colors.text} /></View>
          <View style={styles.sectionCopy}>
            <AppText muted style={styles.eyebrow}>نطاق الحذف</AppText>
            <AppText weight="bold" style={styles.sectionTitle}>إيه اللي بيتأثر؟</AppText>
          </View>
        </View>
        <View style={styles.list}>
          {DELETE_COVERAGE.map((item) => (
            <View key={item} style={styles.listRow}>
              <View style={styles.bullet}><Ionicons name="checkmark" size={13} color={colors.primary} /></View>
              <AppText muted style={styles.listText}>{item}</AppText>
            </View>
          ))}
        </View>
        <View style={styles.retentionNote}>
          <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
          <AppText muted style={styles.retentionText}>قد نحتفظ بقدر محدود من البيانات لو كان مطلوبًا للأمان، منع الاحتيال، حل نزاع، أو التزام قانوني.</AppText>
        </View>
      </View>

      <View style={styles.securityPanel}>
        <Ionicons name="shield-checkmark-outline" size={21} color={colors.success} />
        <View style={styles.securityCopy}>
          <AppText weight="semibold">معلومة أمان مهمة</AppText>
          <AppText muted style={styles.securityText}>تِسوى مش هيطلب منك تبعت كلمة السر أو كود تسجيل الدخول في رسالة حذف الحساب.</AppText>
        </View>
      </View>

      <AppButton label="الرجوع من غير حذف" variant="neutral" onPress={() => router.back()} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 28, lineHeight: 36, textAlign: 'right' },
  subtitle: { lineHeight: 21, textAlign: 'right' },
  warningHero: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.dangerSoft },
  warningIcon: { width: 48, height: 48, borderRadius: radii.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  warningCopy: { flex: 1, gap: spacing.xs, alignItems: 'flex-end' },
  warningTitle: { fontSize: 17, lineHeight: 23, textAlign: 'right' },
  warningText: { fontSize: 13, lineHeight: 20, textAlign: 'right' },
  panel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  sectionIconAccent: { backgroundColor: colors.accentSoft },
  sectionIconNeutral: { backgroundColor: '#EEE7DF' },
  sectionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sectionTitle: { fontSize: 18, textAlign: 'right' },
  sectionText: { lineHeight: 21, textAlign: 'right' },
  emailCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  emailIcon: { width: 40, height: 40, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emailCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  emailHint: { fontSize: 12, textAlign: 'right' },
  list: { gap: spacing.sm },
  listRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { width: 24, height: 24, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  listText: { flex: 1, lineHeight: 20, textAlign: 'right' },
  retentionNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  retentionText: { flex: 1, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  securityPanel: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.successSoft },
  securityCopy: { flex: 1, gap: 3, alignItems: 'flex-end' },
  securityText: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  pressed: { opacity: 0.75 },
});
