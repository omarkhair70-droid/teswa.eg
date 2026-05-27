import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { DirectPrivacySetting, fetchDirectPrivacySetting, updateDirectPrivacySetting } from '@/lib/direct-privacy';

const OPTIONS: { value: DirectPrivacySetting; label: string; description: string }[] = [
  { value: 'everyone', label: 'أي حد', description: 'أي مستخدم يقدر يبعتلك طلب مراسلة.' },
  { value: 'followers_only', label: 'المتابعين فقط', description: 'الناس اللي بينهم وبينك متابعة يقدروا يبعتولك.' },
  { value: 'no_one', label: 'لا أحد', description: 'اقفل طلبات المراسلة الجديدة مؤقتًا.' },
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
    return () => {
      cancelled = true;
    };
  }, [user]);

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
      setFeedback('تعذر تحديث خصوصية الرسائل حالياً.');
      setError(result.message);
    } else {
      setFeedback('تم تحديث خصوصية الرسائل.');
    }
    setSavingValue(null);
  };

  return (
    <AppScreen>
      <View style={styles.root}>
        <AppText weight="bold" style={styles.title}>خصوصية الرسائل</AppText>
        <AppText muted>اختار مين يقدر يبعتلك طلب مراسلة.</AppText>

        {!user ? <AppText muted>سجّل الدخول عشان تتحكم في خصوصية الرسائل.</AppText> : null}
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <AppText muted>{error}</AppText> : null}
        {feedback ? <AppText muted>{feedback}</AppText> : null}

        {!loading && user ? (
          <View style={styles.optionsWrap}>
            {OPTIONS.map((option) => {
              const active = option.value === value;
              const saving = option.value === savingValue;
              return (
                <Pressable key={option.value} onPress={() => void onSelect(option.value)} disabled={!!savingValue}>
                  <AppCard variant={active ? 'default' : 'outlined'} style={[styles.optionCard, active && styles.optionCardActive]}>
                    <View style={styles.optionHeader}>
                      <AppText weight="semibold">{option.label}</AppText>
                      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                        {active ? <View style={styles.radioInner} /> : null}
                      </View>
                    </View>
                    <AppText muted>{option.description}</AppText>
                    {saving ? <AppText muted style={styles.savingText}>جاري الحفظ...</AppText> : null}
                  </AppCard>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, paddingBottom: spacing.xxl },
  title: { fontSize: 22 },
  optionsWrap: { gap: spacing.sm },
  optionCard: { gap: spacing.xs },
  optionCardActive: { borderColor: colors.primary },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  radioOuter: { width: 22, height: 22, borderRadius: radii.round, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: radii.round, backgroundColor: colors.primary },
  savingText: { marginTop: spacing.xs },
});
