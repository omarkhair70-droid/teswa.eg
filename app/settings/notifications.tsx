import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { NotificationPermissionCard } from '@/components/settings/NotificationPermissionCard';
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard';
import {
  fetchMyNotificationPreferences,
  NotificationPreferences,
  updateMyNotificationPreferences,
} from '@/lib/notification-preferences';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';

type NotificationToggleKey =
  | 'offersEnabled'
  | 'dealsEnabled'
  | 'messagesEnabled'
  | 'socialEnabled'
  | 'smartRemindersEnabled'
  | 'marketingEnabled'
  | 'quietHoursEnabled';

const FALLBACK: NotificationPreferences = {
  offersEnabled: true,
  dealsEnabled: true,
  messagesEnabled: true,
  socialEnabled: true,
  smartRemindersEnabled: true,
  marketingEnabled: false,
  quietHoursEnabled: false,
  quietHoursStart: '23:00',
  quietHoursEnd: '08:00',
  updatedAt: null,
};

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>(FALLBACK);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<NotificationToggleKey | null>(null);

  const loadPreferences = async () => {
    if (!user) return;
    setLoading(true);
    const result = await fetchMyNotificationPreferences();
    setPreferences(result.data);
    setError(result.ok ? null : result.message);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await fetchMyNotificationPreferences();
      if (cancelled) return;
      setPreferences(result.data);
      setError(result.ok ? null : result.message);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleToggle = async (key: NotificationToggleKey, value: boolean) => {
    const previous = preferences;

    setSavingKey(key);
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setError(null);

    const result = await updateMyNotificationPreferences({ [key]: value });

    if (!result.ok) {
      setPreferences(previous);
      setError('تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى.');
    } else {
      setPreferences(result.data);
    }

    setSavingKey(null);
  };

  const enabledCount = useMemo(() => [
    preferences.offersEnabled,
    preferences.dealsEnabled,
    preferences.messagesEnabled,
    preferences.socialEnabled,
    preferences.smartRemindersEnabled,
    preferences.marketingEnabled,
  ].filter(Boolean).length, [preferences]);

  if (!user) {
    return (
      <AppScreen backgroundVariant="alive">
        <View style={styles.signedOut}>
          <View style={styles.signedOutIcon}><Ionicons name="notifications-outline" size={30} color={colors.primary} /></View>
          <AppText weight="bold" style={styles.signedOutTitle}>إعدادات الإشعارات مرتبطة بحسابك</AppText>
          <AppText muted style={styles.signedOutText}>سجّل الدخول عشان تتحكم في اللي يوصلك ووقت الهدوء.</AppText>
          <AppButton label="الرجوع" variant="neutral" onPress={() => router.back()} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText muted style={styles.eyebrow}>اختار اللي يستحق يقاطعك</AppText>
          <AppText weight="bold" style={styles.title}>إعدادات الإشعارات</AppText>
          <AppText muted style={styles.subtitle}>الجهاز يحدد هل التنبيه يقدر يظهر، وإعدادات تِسوى تحدد نوع التنبيهات اللي نبعتها ليك.</AppText>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}><Ionicons name="options-outline" size={22} color={colors.primary} /></View>
        <View style={styles.summaryCopy}>
          <AppText muted style={styles.eyebrow}>اختيارات حسابك</AppText>
          <AppText weight="bold" style={styles.summaryTitle}>{loading ? 'بنحمّل اختياراتك...' : `${enabledCount} أنواع شغالة`}</AppText>
          <AppText muted style={styles.summaryText}>{preferences.quietHoursEnabled ? `وضع الهدوء شغال من ${preferences.quietHoursStart} إلى ${preferences.quietHoursEnd}.` : 'وضع الهدوء مقفول حاليًا.'}</AppText>
        </View>
        <View style={[styles.statusDot, preferences.quietHoursEnabled && styles.statusDotQuiet]} />
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <View style={styles.errorCopy}>
            <AppText weight="semibold" style={styles.errorTitle}>الإعدادات محتاجة إعادة تحميل</AppText>
            <AppText style={styles.errorText}>{error}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="إعادة تحميل إعدادات الإشعارات" onPress={() => void loadPreferences()} style={styles.retryButton}>
            <Ionicons name="refresh-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionLead}>
        <View style={styles.leadIcon}><Ionicons name="phone-portrait-outline" size={20} color={colors.accent} /></View>
        <View style={styles.leadCopy}>
          <AppText muted style={styles.eyebrow}>الطبقة الأولى</AppText>
          <AppText weight="bold" style={styles.leadTitle}>هل الجهاز نفسه جاهز؟</AppText>
          <AppText muted style={styles.leadText}>لو الإذن مقفول من النظام، أي اختيار تحت مش هيقدر يظهر كـPush على الجهاز.</AppText>
        </View>
      </View>
      <NotificationPermissionCard />

      <View style={styles.sectionLead}>
        <View style={styles.leadIcon}><Ionicons name="notifications-outline" size={20} color={colors.primary} /></View>
        <View style={styles.leadCopy}>
          <AppText muted style={styles.eyebrow}>الطبقة الثانية</AppText>
          <AppText weight="bold" style={styles.leadTitle}>إيه اللي تحب تِسوى ينبهك بيه؟</AppText>
          <AppText muted style={styles.leadText}>قسّمناها حسب أهميتها عشان تعرف تقفل الإزعاج من غير ما تفوّت حركة مهمة.</AppText>
        </View>
      </View>

      <NotificationPreferencesCard
        preferences={preferences}
        loading={loading}
        savingKey={savingKey}
        onToggle={handleToggle}
      />

      <View style={styles.footerNote}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
        <AppText muted style={styles.footerText}>توقيت وضع الهدوء بيتسجل من توقيت جهازك تلقائيًا عشان ساعات الراحة تفضل صحيحة حتى لو إعداد الحساب القديم كان ناقص منطقة زمنية.</AppText>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  signedOut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  signedOutIcon: { width: 64, height: 64, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  signedOutTitle: { fontSize: 20, textAlign: 'center' },
  signedOutText: { textAlign: 'center', lineHeight: 21 },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 11 },
  title: { fontSize: 28, lineHeight: 36, textAlign: 'right' },
  subtitle: { lineHeight: 21, textAlign: 'right' },
  summaryCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryIcon: { width: 48, height: 48, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  summaryTitle: { fontSize: 17, textAlign: 'right' },
  summaryText: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  statusDot: { width: 10, height: 10, borderRadius: radii.round, backgroundColor: colors.success },
  statusDotQuiet: { backgroundColor: colors.accent },
  errorCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  errorTitle: { color: colors.danger },
  errorText: { color: colors.danger, fontSize: 11, lineHeight: 17, textAlign: 'right' },
  retryButton: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sectionLead: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.xs },
  leadIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  leadCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  leadTitle: { fontSize: 18, textAlign: 'right' },
  leadText: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  footerNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  footerText: { flex: 1, fontSize: 10, lineHeight: 16, textAlign: 'right' },
});
