import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppCard } from '@/components/ui/AppCard';
import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { checkIsAdminUser } from '@/lib/admin';
import { fetchDirectPrivacySetting, type DirectPrivacySetting } from '@/lib/direct-privacy';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type SettingsSectionProps = { title: string; description: string; icon: AppIconName; tone?: 'primary' | 'accent' | 'neutral'; children: ReactNode };
const privacyLabels: Record<DirectPrivacySetting, string> = { everyone: 'أي حد', followers_only: 'المتابعين فقط', no_one: 'لا أحد' };

const createStyles = (colors: TeswaThemeColors) => ({
  root: { gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { flexDirection: 'row-reverse' as const, alignItems: 'flex-start' as const, gap: spacing.md },
  heroIcon: { width: 46, height: 46, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  heroCopy: { flex: 1, alignItems: 'flex-end' as const, gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 29, lineHeight: 36, textAlign: 'right' as const },
  heroDescription: { textAlign: 'right' as const, lineHeight: 21 },
  sectionCard: { borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  sectionHeader: { flexDirection: 'row-reverse' as const, alignItems: 'flex-start' as const, gap: spacing.sm },
  sectionIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  sectionCopy: { flex: 1, alignItems: 'flex-end' as const, gap: 2 },
  sectionTitle: { fontSize: 17, textAlign: 'right' as const },
  sectionDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' as const },
  sectionBody: { marginTop: spacing.md, gap: spacing.sm },
  linkRow: { minHeight: 58, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  linkIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.surface },
  linkIconDanger: { backgroundColor: colors.dangerSoft },
  optionCopy: { flex: 1, alignItems: 'flex-end' as const, gap: 2 },
  rowDescription: { fontSize: 11, lineHeight: 17, textAlign: 'right' as const },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  statusText: { color: colors.primary, fontSize: 10 },
  dangerText: { color: colors.danger },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});

function SettingsSection({ title, description, icon, tone = 'primary', children }: SettingsSectionProps) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const toneStyles = {
    primary: { icon: colors.primary, surface: colors.primarySoft },
    accent: { icon: colors.accent, surface: colors.accentSoft },
    neutral: { icon: colors.text, surface: colors.neutralSoft },
  };
  const palette = toneStyles[tone];
  return (
    <AppCard style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: palette.surface }]}><AppIcon name={icon} size={18} color={palette.icon} /></View>
        <View style={styles.sectionCopy}><AppText weight="bold" style={styles.sectionTitle}>{title}</AppText><AppText muted style={styles.sectionDescription}>{description}</AppText></View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </AppCard>
  );
}

function LinkRow({ icon, label, description, onPress, badge, danger = false }: { icon: AppIconName; label: string; description?: string; onPress: () => void; badge?: string; danger?: boolean }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}${description ? `. ${description}` : ''}`} onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
      <View style={[styles.linkIcon, danger && styles.linkIconDanger]}><AppIcon name={icon} size={17} color={danger ? colors.danger : colors.textMuted} /></View>
      <View style={styles.optionCopy}><AppText weight="semibold" style={danger ? styles.dangerText : undefined}>{label}</AppText>{description ? <AppText muted style={styles.rowDescription}>{description}</AppText> : null}</View>
      {badge ? <View style={styles.statusPill}><AppText style={styles.statusText}>{badge}</AppText></View> : null}
      <AppIcon name="chevronLeft" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const [showAdminReports, setShowAdminReports] = useState(false);
  const [privacyValue, setPrivacyValue] = useState<DirectPrivacySetting | null>(null);

  useEffect(() => {
    let mounted = true;
    void checkIsAdminUser().then((result) => { if (mounted) setShowAdminReports(result.ok && result.isAdmin); }).catch(() => { if (mounted) setShowAdminReports(false); });
    return () => { mounted = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void fetchDirectPrivacySetting().then((result) => {
      if (!active) return;
      setPrivacyValue(result.ok ? result.value : null);
    }).catch(() => { if (active) setPrivacyValue(null); });
    return () => { active = false; };
  }, []));

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.root}>
        <AppFadeIn>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><AppIcon name="palette" size={22} color={colors.primary} /></View>
            <View style={styles.heroCopy}><AppText muted style={styles.eyebrow}>مركز التحكم</AppText><AppText weight="bold" style={styles.title}>الإعدادات</AppText><AppText muted style={styles.heroDescription}>الحساب، الإشعارات والخصوصية. شكل تِسوى بيتبع إعدادات جهازك تلقائيًا.</AppText></View>
          </View>
        </AppFadeIn>

        <SettingsSection icon="user" title="الحساب والأمان" description="بيانات الحساب، قفل التطبيق، تسجيل الخروج والحذف.">
          <LinkRow icon="user" label="الحساب والأمان" description="إدارة الجلسة وحماية هذا الجهاز." onPress={() => router.push('/settings/account')} />
          <LinkRow icon="user" label="تعديل الملف الشخصي" description="الاسم والصورة والنبذة والموقع." onPress={() => router.push('/profile/edit')} />
        </SettingsSection>

        <SettingsSection icon="bell" tone="accent" title="الإشعارات" description="اختار اللي يستحق ينبهك وراجع النشاط الجديد.">
          <LinkRow icon="bell" label="تفضيلات الإشعارات" description="أنواع التنبيهات ووضع الهدوء." onPress={() => router.push('/settings/notifications')} />
          <LinkRow icon="bell" label="مركز الإشعارات" description="كل النشاط والوجهات المرتبطة به." onPress={() => router.push('/notifications')} />
        </SettingsSection>

        <SettingsSection icon="shield" title="الخصوصية والأمان المجتمعي" description="حدود التواصل والقواعد اللي بتحمي استخدام تِسوى.">
          {showAdminReports ? <LinkRow icon="shield" label="لوحة البلاغات" description="مراجعة بلاغات الثقة والسلامة." badge="إدارة" onPress={() => router.push('/admin/reports')} /> : null}
          <LinkRow icon="user" label="خصوصية الرسائل" description="حدد مين يقدر يبدأ محادثة معاك." badge={privacyValue ? privacyLabels[privacyValue] : undefined} onPress={() => router.push('/settings/direct-privacy')} />
          <LinkRow icon="x" label="المستخدمون المحظورون" description="راجع الحسابات اللي حظرتها أو فك الحظر." onPress={() => router.push('/settings/blocked-users')} />
          <LinkRow icon="lock" label="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
          <LinkRow icon="info" label="شروط الاستخدام" onPress={() => router.push('/legal/terms')} />
          <LinkRow icon="user" label="إرشادات المجتمع" onPress={() => router.push('/legal/community-guidelines')} />
        </SettingsSection>
      </View>
    </AppScreen>
  );
}
