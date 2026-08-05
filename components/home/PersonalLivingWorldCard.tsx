import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { PersonalLivingSignal, PersonalLivingWorldState } from '@/lib/personal-living-world';

type Props = {
  state: PersonalLivingWorldState;
  loading?: boolean;
  onPrimaryAction?: () => void;
};

const toneStyles = {
  attention: { gradient: ['#FFF9F3', '#F7DFCC', '#FFF6E8'], border: 'rgba(184,98,63,0.24)', accent: colors.primary },
  alive: { gradient: ['#F8FFFC', '#DDEFEA', '#F4FFFB'], border: 'rgba(62,124,115,0.24)', accent: colors.accent },
  calm: { gradient: ['#FFFCF7', '#F4ECE3', '#FFFBF4'], border: 'rgba(138,90,45,0.2)', accent: '#8A5A2D' },
  first_visit: { gradient: ['#FFFDF8', '#F7E9DA', '#F6FBF8'], border: 'rgba(184,98,63,0.2)', accent: colors.primary },
} as const;

const signalToneBg: Record<PersonalLivingSignal['tone'], string> = {
  attention: 'rgba(184,98,63,0.13)',
  messages: 'rgba(90,116,168,0.13)',
  stories: 'rgba(138,90,45,0.13)',
  video: 'rgba(62,124,115,0.13)',
  items: 'rgba(114,96,84,0.13)',
  quiet: 'rgba(110,110,110,0.1)',
};

export function PersonalLivingWorldCard({ state, loading = false, onPrimaryAction }: Props) {
  const tone = toneStyles[state.tone];

  return (
    <LinearGradient
      colors={tone.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { borderColor: tone.border }]}
    >
      <View style={styles.orbPrimary} />
      <View style={styles.headerRow}>
        <View style={styles.headerIdentity}>
          <View style={[styles.iconShell, { backgroundColor: `${tone.accent}18` }]}>
            <Ionicons name="time-outline" size={18} color={tone.accent} />
          </View>
          <View style={styles.headerCopy}>
            <AppText weight="semibold" style={[styles.eyebrow, { color: tone.accent }]}>منذ آخر زيارة</AppText>
            <AppText muted style={styles.visitLabel}>{state.visitLabel}</AppText>
          </View>
        </View>
        <View style={[styles.toneDot, { backgroundColor: tone.accent }]} />
      </View>

      {loading ? (
        <View style={styles.loadingBlock} accessibilityLabel="جاري تجهيز ملخص آخر زيارة">
          <View style={styles.loadingTitle} />
          <View style={styles.loadingLine} />
          <View style={styles.loadingSignals}>
            <View style={styles.loadingPill} />
            <View style={styles.loadingPill} />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.copyBlock}>
            <AppText weight="bold" style={styles.title}>{state.title}</AppText>
            <AppText muted style={styles.body}>{state.body}</AppText>
          </View>
          <View style={styles.signalsWrap}>
            {state.signals.map((signal) => (
              <View key={signal.key} style={[styles.signalPill, { backgroundColor: signalToneBg[signal.tone] }]}>
                <Ionicons name={signal.icon as never} size={14} color={colors.text} />
                <AppText weight="bold" style={styles.signalValue}>{signal.value}</AppText>
                <AppText style={styles.signalLabel}>{signal.label}</AppText>
              </View>
            ))}
          </View>
          {state.primaryActionLabel && state.primaryActionRoute ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={state.primaryActionLabel}
              onPress={onPrimaryAction}
              style={({ pressed }) => [styles.ctaButton, { backgroundColor: tone.accent }, pressed && styles.ctaButtonPressed]}
            >
              <AppText weight="semibold" style={styles.ctaText}>{state.primaryActionLabel}</AppText>
              <Ionicons name="arrow-back-outline" size={15} color={colors.white} />
            </Pressable>
          ) : null}
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  orbPrimary: { position: 'absolute', width: 150, height: 150, borderRadius: 75, top: -70, left: -42, backgroundColor: 'rgba(255,255,255,0.34)' },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerIdentity: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  iconShell: { width: 34, height: 34, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontSize: 12 },
  visitLabel: { fontSize: 11 },
  toneDot: { width: 9, height: 9, borderRadius: 5 },
  copyBlock: { gap: spacing.xs },
  title: { fontSize: 18, lineHeight: 24 },
  body: { color: '#5C5146', fontSize: 12, lineHeight: 19 },
  signalsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  signalPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  signalValue: { fontSize: 12 },
  signalLabel: { fontSize: 11 },
  ctaButton: { alignSelf: 'flex-start', flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ctaButtonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  ctaText: { color: colors.white, fontSize: 13 },
  loadingBlock: { gap: spacing.sm },
  loadingTitle: { width: '66%', height: 20, borderRadius: radii.sm, backgroundColor: 'rgba(184,98,63,0.14)' },
  loadingLine: { width: '90%', height: 12, borderRadius: radii.sm, backgroundColor: 'rgba(29,26,22,0.09)' },
  loadingSignals: { flexDirection: 'row-reverse', gap: spacing.xs },
  loadingPill: { width: 94, height: 30, borderRadius: radii.round, backgroundColor: 'rgba(29,26,22,0.07)' },
});
