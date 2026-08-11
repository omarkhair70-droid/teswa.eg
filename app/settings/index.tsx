import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppCard } from '@/components/ui/AppCard';
import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { SettingsStatusCard } from '@/components/settings/SettingsStatusCard';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { checkIsAdminUser } from '@/lib/admin';
import {
  getCurrentLayoutDirectionNote,
  getLanguagePreference,
  setLanguagePreference,
  type LanguagePreference,
} from '@/lib/i18n';
import { fetchDirectPrivacySetting, type DirectPrivacySetting } from '@/lib/direct-privacy';
import { useThemePreferences, type AppearancePreference } from '@/lib/preferences/appearance';

type SettingsOption<TValue extends string> = { label: string; value: TValue; description: string; disabled?: boolean };
type SettingsSectionProps = { title: string; description: string; icon: AppIconName; tone?: 'primary' | 'accent' | 'neutral'; children: ReactNode };

const appearanceOptions: SettingsOption<AppearancePreference>[] = [
  { label: 'حسب النظام', value: 'system', description: 'يتبع إعدادات جهازك تلقائيًا.' },
  { label: 'فاتح', value: 'light', description: 'واجهة فاتحة للاستخدام اليومي.' },
  { label: 'داكن', value: 'dark', description: 'يستخدم الوضع الداكن في الشاشات المدعومة.' },
];
const languageOptions: SettingsOption<LanguagePreference>[] = [
  { label: 'العربية', value: 'ar', description: 'اللغة الأساسية وتجربة RTL.' },
  { label: 'English', value: 'en', description: 'هيتوفر بعد اكتمال ترجمة التجربة.', disabled: true },
  { label: 'حسب النظام', value: 'system', description: 'يتبع لغة الجهاز عند اكتمال دعم اللغات.' },
];
const privacyLabels: Record<DirectPrivacySetting, string> = { everyone: 'أي حد', followers_only: 'المتابعين فقط', no_one: 'لا أحد' };
const toneStyles = {
  primary: { icon: colors.primary, surface: colors.primarySoft },
  accent: { icon: colors.accent, surface: colors.accentSoft },
  neutral: { icon: colors.text, surface: '#EEE7DF' },
};

function SettingsSection({ title, description, icon, tone = 'primary', children }: SettingsSectionProps) {
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

function OptionRow<TValue extends string>({ option, selected, onSelect }: { option: SettingsOption<TValue>; selected: boolean; onSelect: (value: TValue) => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: option.disabled }} disabled={option.disabled} onPress={() => onSelect(option.value)} style={({ pressed }) => [styles.optionRow, selected && styles.optionRowSelected, option.disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={styles.optionCopy}>
        <View style={styles.optionHeading}><AppText weight="semibold">{option.label}</AppText>{option.disabled ? <View style={styles.soonPill}><AppText style={styles.soonText}>قريبًا</AppText></View> : null}</View>
        <AppText muted style={styles.rowDescription}>{option.description}</AppText>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

function LinkRow({ icon, label, description, onPress, badge, danger = false }: { icon: AppIconName; label: string; description?: string; onPress: () => void; badge?: string; danger?: boolean }) {
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
  const [showAdminReports, setShowAdminReports] = useState(false);
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(getLanguagePreference);
  const [privacyValue, setPrivacyValue] = useState<DirectPrivacySetting | null>(null);
  const [privacyLoaded, setPrivacyLoaded] = useState(false);
  const { appearancePreference, setAppearancePreference, resolvedThemeMode } = useThemePreferences();

  useEffect(() => {
    let mounted = true;
    void checkIsAdminUser().then((result) => { if (mounted) setShowAdminReports(result.ok && result.isAdmin); }).catch(() => { if (mounted) setShowAdminReports(false); });
    return () => { mounted = false; };
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setPrivacyLoaded(false);
    void fetchDirectPrivacySetting().then((result) => {
      if (!active) return;
      setPrivacyValue(result.ok ? result.value : null);
      setPrivacyLoaded(true);
    }).catch(() => {
      if (!active) return;
      setPrivacyValue(null);
      setPrivacyLoaded(true);
    });
    return () => { active = false; };
  }, []));

  const appearanceLabel = useMemo(() => appearancePreference === 'system' ? `النظام · ${resolvedThemeMode === 'dark' ? 'داكن' : 'فاتح'}` : appearancePreference === 'dark' ? 'داكن' : 'فاتح', [appearancePreference, resolvedThemeMode]);
  const languageLabel = languagePreference === 'system' ? 'النظام' : languagePreference === 'en' ? 'English' : 'العربية';
  const privacyLabel = privacyValue ? privacyLabels[privacyValue] : privacyLoaded ? 'غير متاح' : '...';
  const setLanguage = (value: LanguagePreference) => { setLanguagePreferenceState(value); setLanguagePreference(value); };

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.root}>
        <AppFadeIn>
          <View style={styles.hero}>
            <View style={styles.heroIcon}><AppIcon name="palette" size={22} color={colors.primary} /></View>
            <View style={styles.heroCopy}><AppText muted style={styles.eyebrow}>مركز التحكم</AppText><AppText weight="bold" style={styles.title}>الإعدادات</AppText><AppText muted style={styles.heroDescription}>كل ما يخص التطبيق والحساب والأمان هنا، بعيدًا عن ملفك العام.</AppText></View>
          </View>
        </AppFadeIn>

        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}><AppIcon name="palette" size={15} color={colors.primary} /><AppText weight="semibold" style={styles.summaryValue}>{appearanceLabel}</AppText><AppText muted style={styles.summaryLabel}>المظهر</AppText></View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}><AppIcon name="globe" size={15} color={colors.accent} /><AppText weight="semibold" style={styles.summaryValue}>{languageLabel}</AppText><AppText muted style={styles.summaryLabel}>اللغة</AppText></View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}><AppIcon name="shield" size={15} color={colors.text} /><AppText weight="semibold" style={styles.summaryValue}>{privacyLabel}</AppText><AppText muted style={styles.summaryLabel}>الرسائل</AppText></View>
        </View>

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
          <LinkRow icon="lock" label="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
          <LinkRow icon="info" label="شروط الاستخدام" onPress={() => router.push('/legal/terms')} />
          <LinkRow icon="user" label="إرشادات المجتمع" onPress={() => router.push('/legal/community-guidelines')} />
        </SettingsSection>

        <SettingsSection icon="palette" tone="neutral" title="المظهر" description="شكل تِسوى على جهازك.">
          {appearanceOptions.map((option) => <OptionRow key={option.value} option={option} selected={appearancePreference === option.value} onSelect={setAppearancePreference} />)}
        </SettingsSection>

        <SettingsSection icon="globe" tone="neutral" title="اللغة" description="تِسوى عربية أولًا، ودعم اللغات بيتوسع تدريجيًا.">
          {languageOptions.map((option) => <OptionRow key={option.value} option={option} selected={languagePreference === option.value} onSelect={setLanguage} />)}
          <View style={styles.noteRow}><AppIcon name="info" size={14} color={colors.textMuted} /><AppText muted style={styles.note}>{getCurrentLayoutDirectionNote()}</AppText></View>
        </SettingsSection>

        <SettingsSection icon="info" tone="neutral" title="عن تِسوى" description="حالة الخدمات والإعدادات المدعومة حاليًا.">
          <SettingsStatusCard />
        </SettingsSection>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  heroIcon: { width: 46, height: 46, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 29, lineHeight: 36, textAlign: 'right' },
  heroDescription: { textAlign: 'right', lineHeight: 21 },
  summaryStrip: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  summaryDivider: { width: 1, height: 34, backgroundColor: colors.border },
  summaryValue: { fontSize: 12, textAlign: 'center' },
  summaryLabel: { fontSize: 10, textAlign: 'center' },
  sectionCard: { borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  sectionIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sectionTitle: { fontSize: 17, textAlign: 'right' },
  sectionDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  sectionBody: { marginTop: spacing.md, gap: spacing.sm },
  linkRow: { minHeight: 58, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  linkIcon: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  linkIconDanger: { backgroundColor: colors.dangerSoft },
  optionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  rowDescription: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  statusText: { color: colors.primary, fontSize: 10 },
  dangerText: { color: colors.danger },
  optionRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, backgroundColor: colors.white },
  optionRowSelected: { borderColor: colors.primary, backgroundColor: '#FFF8F3' },
  optionHeading: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  radio: { width: 22, height: 22, borderRadius: radii.round, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: radii.round, backgroundColor: colors.primary },
  soonPill: { borderRadius: radii.round, backgroundColor: '#EEE7DF', paddingHorizontal: 7, paddingVertical: 2 },
  soonText: { fontSize: 9, color: colors.textMuted },
  noteRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.xs },
  note: { flex: 1, fontSize: 11, lineHeight: 17, textAlign: 'right' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
