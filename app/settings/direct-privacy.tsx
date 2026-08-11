import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { DirectPrivacySetting, fetchDirectPrivacySetting, updateDirectPrivacySetting } from '@/lib/direct-privacy';

const OPTIONS: { value: DirectPrivacySetting; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; note: string }[] = [
  { value: 'everyone', label: 'أي حد', description: 'أي مستخدم يقدر يبعتلك طلب مراسلة جديد.', icon: 'people-outline', note: 'مناسب لو حابب تكون متاح للتواصل واكتشاف فرص تبديل جديدة.' },
  { value: 'followers_only', label: 'المتابعين فقط', description: 'طلبات الرسائل الجديدة تبقى من الناس اللي بينهم وبينك متابعة.', icon: 'person-add-outline', note: 'اختيار أهدى لو بتحب تبدأ الكلام مع ناس عندك بينهم سياق مسبق.' },
  { value: 'no_one', label: 'لا أحد', description: 'اقفل طلبات المراسلة الجديدة مؤقتًا.', icon: 'shield-outline', note: 'المحادثات الموجودة تفضل زي ما هي؛ ده بيوقف الطلبات الجديدة فقط.' },
];

export default function DirectPrivacySettingsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingValue, setSavingValue] = useState<DirectPrivacySetting | null>(null);
  const [value, setValue] = useState<DirectPrivacySetting>('everyone');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await fetchDirectPrivacySetting();
      if (cancelled) return;
      if (result.ok) {
        setValue(result.value);
        setError(null);
      } else {
        setError(result.message);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const selectedOption = useMemo(() => OPTIONS.find((option) => option.value === value) ?? OPTIONS[0], [value]);

  const onSelect = async (next: DirectPrivacySetting) => {
    if (next === value || !!savingValue) return;
    const previous = value;
    setValue(next);
    setSavingValue(next);
    setError(null);
    setFeedback(null);
    const result = await updateDirectPrivacySetting(next);
    if (!result.ok) {
      setValue(previous);
      setFeedback(null);
      setError(result.message || 'تعذر تحديث خصوصية الرسائل حالياً.');
    } else {
      setFeedback('اتحفظ اختيارك.');
    }
    setSavingValue(null);
  };

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText muted style={styles.eyebrow}>الخصوصية والتواصل</AppText>
          <AppText weight="bold" style={styles.title}>مين يقدر يبدأ كلام معاك؟</AppText>
          <AppText muted style={styles.subtitle}>اختيارك بيحدد طلبات المراسلة الجديدة من غير ما يغيّر المحادثات اللي بدأت بالفعل.</AppText>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusIcon}><Ionicons name={selectedOption.icon} size={22} color={colors.accent} /></View>
        <View style={styles.statusCopy}>
          <AppText muted style={styles.eyebrow}>الإعداد الحالي</AppText>
          <AppText weight="bold" style={styles.statusTitle}>{loading ? 'جاري التحميل...' : selectedOption.label}</AppText>
          {!loading ? <AppText muted style={styles.statusDescription}>{selectedOption.note}</AppText> : null}
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : <View style={styles.activeDot} />}
      </View>

      {!user ? (
        <View style={styles.messageCard}>
          <Ionicons name="log-in-outline" size={20} color={colors.primary} />
          <AppText muted style={styles.messageText}>سجّل الدخول عشان تتحكم في خصوصية الرسائل.</AppText>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.messageCard, styles.errorCard]}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <AppText style={styles.errorText}>{error}</AppText>
        </View>
      ) : null}

      {feedback ? (
        <View style={[styles.messageCard, styles.successCard]}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
          <AppText style={styles.successText}>{feedback}</AppText>
        </View>
      ) : null}

      {!loading && user ? (
        <View style={styles.optionsPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}><Ionicons name="options-outline" size={19} color={colors.primary} /></View>
            <View style={styles.sectionCopy}>
              <AppText muted style={styles.eyebrow}>طلبات المراسلة</AppText>
              <AppText weight="bold" style={styles.sectionTitle}>اختار مستوى الوصول المناسب</AppText>
            </View>
          </View>

          <View style={styles.optionsWrap}>
            {OPTIONS.map((option) => {
              const active = option.value === value;
              const saving = option.value === savingValue;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.description}
                  accessibilityState={{ selected: active, disabled: !!savingValue }}
                  onPress={() => void onSelect(option.value)}
                  disabled={!!savingValue}
                  style={({ pressed }) => [styles.optionCard, active && styles.optionCardActive, pressed && styles.pressed]}
                >
                  <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                    <Ionicons name={option.icon} size={20} color={active ? colors.primary : colors.textMuted} />
                  </View>
                  <View style={styles.optionCopy}>
                    <View style={styles.optionTitleRow}>
                      <AppText weight="semibold" style={styles.optionTitle}>{option.label}</AppText>
                      {saving ? <AppText muted style={styles.savingText}>جاري الحفظ...</AppText> : null}
                    </View>
                    <AppText muted style={styles.optionDescription}>{option.description}</AppText>
                  </View>
                  <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                    {active ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.safetyNote}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
        <View style={styles.safetyCopy}>
          <AppText weight="semibold">لسه عندك أدوات أمان جوه أي محادثة</AppText>
          <AppText muted style={styles.safetyText}>تقدر تبلغ عن حساب أو رسالة وتحظر المستخدم من خيارات المحادثة وقت ما تحتاج.</AppText>
        </View>
      </View>
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
  statusCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusIcon: { width: 48, height: 48, borderRadius: radii.lg, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  statusCopy: { flex: 1, gap: 2, alignItems: 'flex-end' },
  statusTitle: { fontSize: 18 },
  statusDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  activeDot: { width: 10, height: 10, borderRadius: radii.round, backgroundColor: colors.success },
  messageCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  messageText: { flex: 1, textAlign: 'right' },
  errorCard: { backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, textAlign: 'right' },
  successCard: { backgroundColor: colors.successSoft },
  successText: { flex: 1, color: colors.success, textAlign: 'right' },
  optionsPanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.lg },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sectionTitle: { fontSize: 18, textAlign: 'right' },
  optionsWrap: { gap: spacing.sm },
  optionCard: { minHeight: 76, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  optionCardActive: { borderColor: colors.primary, backgroundColor: '#FFF8F3' },
  optionIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  optionIconActive: { backgroundColor: colors.primarySoft },
  optionCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  optionTitleRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  optionTitle: { fontSize: 16 },
  optionDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  savingText: { fontSize: 11 },
  radioOuter: { width: 22, height: 22, borderRadius: radii.round, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  radioOuterActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: radii.round, backgroundColor: colors.primary },
  safetyNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  safetyCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  safetyText: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
});
