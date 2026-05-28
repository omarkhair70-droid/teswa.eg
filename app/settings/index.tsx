import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppCard } from '@/components/ui/AppCard';
import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { getCurrentLayoutDirectionNote, getLanguagePreference, setLanguagePreference, t, type LanguagePreference } from '@/lib/i18n';
import { checkIsAdminUser } from '@/lib/admin';
import { useThemePreferences, type AppearancePreference } from '@/lib/preferences/appearance';

type SettingsOption<TValue extends string> = {
  label: string;
  value: TValue;
  description?: string;
  disabled?: boolean;
};

type SettingsSectionProps = {
  title: string;
  description?: string;
  icon: AppIconName;
  children?: ReactNode;
};

const appearanceOptions: SettingsOption<AppearancePreference>[] = [
  { label: 'حسب النظام', value: 'system', description: 'اتبع إعدادات الجهاز بدون فرض تغيير على الشاشات الحالية.' },
  { label: 'فاتح', value: 'light', description: 'يحفظ التفضيل للطبقة الجديدة فقط حالياً.' },
  { label: 'داكن', value: 'dark', description: 'جاهز للثيم القادم، بدون فرض إعادة تصميم الآن.' },
];

const languageOptions: SettingsOption<LanguagePreference>[] = [
  { label: 'العربية', value: 'ar', description: 'اللغة الافتراضية الحالية.' },
  { label: 'English', value: 'en', description: 'Coming soon: full English copy is not ready yet.', disabled: true },
  { label: 'حسب النظام', value: 'system', description: 'جاهز لاحقاً بعد اكتمال دعم الترجمة.' },
];

function SettingsSection({ title, description, icon, children }: SettingsSectionProps) {
  return (
    <AppCard>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <AppIcon name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.sectionTitleColumn}>
          <AppText weight="semibold" style={styles.sectionTitle}>{title}</AppText>
          {description ? <AppText muted>{description}</AppText> : null}
        </View>
      </View>
      {children ? <View style={styles.sectionBody}>{children}</View> : null}
    </AppCard>
  );
}

function OptionRow<TValue extends string>({
  option,
  selected,
  onSelect,
}: {
  option: SettingsOption<TValue>;
  selected: boolean;
  onSelect: (value: TValue) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: option.disabled }}
      disabled={option.disabled}
      onPress={() => onSelect(option.value)}
      style={[styles.optionRow, selected && styles.optionRowSelected, option.disabled && styles.optionRowDisabled]}
    >
      <View style={styles.optionCopy}>
        <AppText weight="semibold">{option.label}</AppText>
        {option.description ? <AppText muted>{option.description}</AppText> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <AppIcon name="check" size={14} color={colors.white} /> : null}
      </View>
    </Pressable>
  );
}

function LinkRow({ label, description, onPress }: { label: string; description?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkRow}>
      <View style={styles.optionCopy}>
        <AppText weight="semibold">{label}</AppText>
        {description ? <AppText muted>{description}</AppText> : null}
      </View>
      <AppIcon name="chevronLeft" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const [showAdminReports, setShowAdminReports] = useState(false);
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(getLanguagePreference);
  const { appearancePreference, setAppearancePreference, resolvedThemeMode } = useThemePreferences();

  useEffect(() => {
    let mounted = true;

    void checkIsAdminUser().then((result) => {
      if (!mounted) return;
      setShowAdminReports(result.ok && result.isAdmin);
    }).catch(() => {
      if (mounted) setShowAdminReports(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleLanguagePreferenceChange = (nextPreference: LanguagePreference) => {
    setLanguagePreferenceState(nextPreference);
    setLanguagePreference(nextPreference);
  };

  return (
    <AppScreen scrollable>
      <View style={styles.root}>
        <AppText weight="bold" style={styles.title}>{t('settings.title')}</AppText>

        <SettingsSection
          icon="palette"
          title={t('settings.appearance')}
          description={`الوضع الحالي المحسوب: ${resolvedThemeMode === 'dark' ? 'داكن' : 'فاتح'}. لن نفرض المظهر الداكن على الشاشات القديمة في هذا التحديث.`}
        >
          {appearanceOptions.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              selected={appearancePreference === option.value}
              onSelect={setAppearancePreference}
            />
          ))}
        </SettingsSection>

        <SettingsSection
          icon="globe"
          title={t('settings.language')}
          description="العربية تظل الافتراضية. هذه بداية تخزين تفضيل اللغة فقط."
        >
          {languageOptions.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              selected={languagePreference === option.value}
              onSelect={handleLanguagePreferenceChange}
            />
          ))}
          <AppText muted style={styles.note}>{getCurrentLayoutDirectionNote()}</AppText>
        </SettingsSection>

        <SettingsSection icon="bell" title={t('settings.notifications')} description="تحكم في تنبيهات تِسوى بدون تغيير سلوك الإشعارات الحالي.">
          <LinkRow label="إعدادات الإشعارات" description="أنواع التنبيهات ووضع الهدوء." onPress={() => router.push('/settings/notifications')} />
          <LinkRow label="مركز الإشعارات" description="افتح الإشعارات الحالية." onPress={() => router.push('/notifications')} />
        </SettingsSection>

        <SettingsSection icon="shield" title={t('settings.privacySafety')} description="روابط الخصوصية والثقة والسلامة الحالية.">
          {showAdminReports ? <LinkRow label="لوحة البلاغات" description="مراجعة بلاغات الثقة والسلامة لفريق الإدارة." onPress={() => router.push('/admin/reports')} /> : null}
          <LinkRow label="خصوصية الرسائل" description="تحكم مين يقدر يبعتلك طلب مراسلة." onPress={() => router.push('/settings/direct-privacy')} />
          <LinkRow label="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
          <LinkRow label="شروط الاستخدام" onPress={() => router.push('/legal/terms')} />
          <LinkRow label="إرشادات المجتمع" onPress={() => router.push('/legal/community-guidelines')} />
        </SettingsSection>

        <SettingsSection icon="user" title={t('settings.account')} description="روابط آمنة للحساب بدون نقل حذف الحساب النهائي من شاشة الملف الشخصي.">
          <LinkRow label="تعديل الملف الشخصي" onPress={() => router.push('/profile/edit')} />
          <LinkRow label="طلب حذف الحساب عبر الويب" description="الحذف النهائي داخل شاشة الملف الشخصي لم يتغير." onPress={() => router.push('/account-deletion')} />
        </SettingsSection>

        <SettingsSection icon="info" title={t('settings.about')} description="أساس إعدادات تِسوى قبل البناء القادم.">
          <AppText muted>تمت إضافة طبقة الثيم، اللغة، التوست، الأيقونات، والنماذج بشكل تأسيسي فقط.</AppText>
        </SettingsSection>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  title: { fontSize: 22, marginBottom: spacing.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  sectionTitleColumn: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 17 },
  sectionBody: { marginTop: spacing.md, gap: spacing.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  optionRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionRowDisabled: {
    opacity: 0.55,
  },
  optionCopy: { flex: 1, gap: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  note: { fontSize: 13 },
});
