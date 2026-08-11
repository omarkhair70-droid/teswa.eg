import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { ReportReason } from '@/lib/reports';

export type ReportReasonOption = {
  value: ReportReason;
  label: string;
  description?: string;
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  subjectLabel: string;
  subjectName: string;
  subjectHandle?: string | null;
  subjectAvatarUrl?: string | null;
  subjectMeta?: string | null;
  reasons: ReportReasonOption[];
  selectedReason: ReportReason | null;
  onSelectReason: (reason: ReportReason) => void;
  details: string;
  onChangeDetails: (value: string) => void;
  error?: string | null;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onBack: () => void;
};

export function ReportExperience({
  eyebrow,
  title,
  description,
  subjectLabel,
  subjectName,
  subjectHandle,
  subjectAvatarUrl,
  subjectMeta,
  reasons,
  selectedReason,
  onSelectReason,
  details,
  onChangeDetails,
  error,
  submitting,
  canSubmit,
  onSubmit,
  onBack,
}: Props) {
  const initial = subjectName.trim()?.[0]?.toUpperCase() || '؟';
  const needsDetails = selectedReason === 'other';

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.topCopy}>
          <AppText muted style={styles.eyebrow}>{eyebrow}</AppText>
          <AppText weight="bold" style={styles.topTitle}>{title}</AppText>
        </View>
        <View style={styles.safetyPill}>
          <Ionicons name="shield-checkmark-outline" size={15} color={colors.danger} />
          <AppText style={styles.safetyPillText}>أمان</AppText>
        </View>
      </View>

      <View style={styles.introPanel}>
        <View style={styles.introIcon}>
          <Ionicons name="flag-outline" size={22} color={colors.danger} />
        </View>
        <View style={styles.introCopy}>
          <AppText weight="bold" style={styles.introTitle}>خلّي البلاغ واضح ومحدد</AppText>
          <AppText muted style={styles.introText}>{description}</AppText>
        </View>
      </View>

      <View style={styles.subjectPanel}>
        <View style={styles.subjectHeader}>
          {subjectAvatarUrl ? (
            <Image source={{ uri: subjectAvatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarLetter}>{initial}</AppText></View>
          )}
          <View style={styles.subjectCopy}>
            <AppText muted style={styles.eyebrow}>{subjectLabel}</AppText>
            <AppText weight="bold" style={styles.subjectName}>{subjectName}</AppText>
            {subjectHandle ? <AppText muted>{subjectHandle.startsWith('@') ? subjectHandle : `@${subjectHandle}`}</AppText> : null}
          </View>
          <View style={styles.subjectBadge}><Ionicons name="eye-off-outline" size={17} color={colors.textMuted} /></View>
        </View>
        {subjectMeta ? <View style={styles.metaBox}><Ionicons name="information-circle-outline" size={17} color={colors.textMuted} /><AppText muted style={styles.metaText}>{subjectMeta}</AppText></View> : null}
      </View>

      <View style={styles.sectionPanel}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}><Ionicons name="options-outline" size={19} color={colors.primary} /></View>
          <View style={styles.sectionCopy}>
            <AppText muted style={styles.eyebrow}>الخطوة الأساسية</AppText>
            <AppText weight="bold" style={styles.sectionTitle}>إيه سبب البلاغ؟</AppText>
          </View>
        </View>
        <View style={styles.reasonList}>
          {reasons.map((reason) => {
            const selected = selectedReason === reason.value;
            return (
              <Pressable
                key={reason.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => onSelectReason(reason.value)}
                style={[styles.reasonRow, selected && styles.reasonRowSelected]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.reasonCopy}>
                  <AppText weight={selected ? 'semibold' : 'regular'} style={styles.reasonLabel}>{reason.label}</AppText>
                  {reason.description ? <AppText muted style={styles.reasonDescription}>{reason.description}</AppText> : null}
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.danger} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionPanel}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}><Ionicons name="chatbox-ellipses-outline" size={19} color={colors.primary} /></View>
          <View style={styles.sectionCopy}>
            <AppText muted style={styles.eyebrow}>{needsDetails ? 'مطلوب للسبب المختار' : 'اختياري'}</AppText>
            <AppText weight="bold" style={styles.sectionTitle}>ضيف تفاصيل تساعد المراجعة</AppText>
          </View>
        </View>
        <TextInput
          multiline
          value={details}
          onChangeText={onChangeDetails}
          maxLength={800}
          style={styles.input}
          placeholder="اكتب اللي حصل باختصار، من غير بيانات شخصية حساسة..."
          placeholderTextColor={colors.textMuted}
          textAlign="right"
        />
        <View style={styles.inputFooter}>
          <AppText muted style={styles.helper}>{needsDetails ? 'لازم تكتب تفاصيل بسيطة مع "سبب آخر".' : 'المعلومات المختصرة والواضحة بتسهّل المراجعة.'}</AppText>
          <AppText muted style={styles.counter}>{details.length}/800</AppText>
        </View>
      </View>

      <View style={styles.privacyNote}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
        <AppText muted style={styles.privacyText}>البلاغ بيروح للمراجعة، والطرف الآخر مش بيشوف مين أرسل البلاغ.</AppText>
      </View>

      {error ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={19} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}

      <AppButton label={submitting ? 'جاري إرسال البلاغ...' : 'إرسال البلاغ للمراجعة'} disabled={!canSubmit} onPress={onSubmit} />
      <AppButton label="إلغاء والرجوع" variant="neutral" onPress={onBack} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  topCopy: { flex: 1, alignItems: 'flex-start' },
  topTitle: { fontSize: 22, lineHeight: 29 },
  eyebrow: { fontSize: 12 },
  safetyPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.round, backgroundColor: colors.dangerSoft },
  safetyPillText: { color: colors.danger, fontSize: 12 },
  introPanel: { flexDirection: 'row-reverse', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.dangerSoft, marginBottom: spacing.md },
  introIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  introCopy: { flex: 1, gap: spacing.xs },
  introTitle: { fontSize: 17 },
  introText: { lineHeight: 22 },
  subjectPanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md, marginBottom: spacing.md },
  subjectHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  avatar: { width: 54, height: 54, borderRadius: radii.round },
  avatarFallback: { width: 54, height: 54, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  avatarLetter: { color: colors.primary, fontSize: 20 },
  subjectCopy: { flex: 1, gap: 2, alignItems: 'flex-start' },
  subjectName: { fontSize: 18 },
  subjectBadge: { width: 36, height: 36, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  metaBox: { flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.background },
  metaText: { flex: 1, lineHeight: 20 },
  sectionPanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.lg, marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  sectionIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  sectionCopy: { flex: 1, gap: 2, alignItems: 'flex-start' },
  sectionTitle: { fontSize: 18 },
  reasonList: { gap: spacing.sm },
  reasonRow: { minHeight: 62, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  reasonRowSelected: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  radio: { width: 20, height: 20, borderRadius: radii.round, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.danger },
  radioDot: { width: 9, height: 9, borderRadius: radii.round, backgroundColor: colors.danger },
  reasonCopy: { flex: 1, gap: 2, alignItems: 'flex-start' },
  reasonLabel: { fontSize: 15 },
  reasonDescription: { fontSize: 12, lineHeight: 17 },
  input: { minHeight: 126, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: spacing.md, color: colors.text, textAlignVertical: 'top', fontSize: 15, lineHeight: 22 },
  inputFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: spacing.md },
  helper: { flex: 1, fontSize: 12, lineHeight: 18 },
  counter: { fontSize: 12 },
  privacyNote: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft, marginBottom: spacing.md },
  privacyText: { flex: 1, lineHeight: 20 },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft, marginBottom: spacing.md },
  errorText: { flex: 1, color: colors.danger },
});
