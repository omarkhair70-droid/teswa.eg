import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
  attention: { gradient: ['#FFF9F3', '#F7DFCC', '#FFF6E8'], border: 'rgba(184,98,63,0.24)' },
  alive: { gradient: ['#F8FFFC', '#DDEFEA', '#F4FFFB'], border: 'rgba(62,124,115,0.24)' },
  calm: { gradient: ['#FFFCF7', '#F4ECE3', '#FFFBF4'], border: 'rgba(138,90,45,0.2)' },
  first_visit: { gradient: ['#FFFDF8', '#F7E9DA', '#F6FBF8'], border: 'rgba(184,98,63,0.2)' },
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
    <LinearGradient colors={tone.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { borderColor: tone.border }]}>
      <View style={styles.orbPrimary} />
      <View style={styles.orbAccent} />
      <View style={styles.headerRow}>
        <View style={styles.iconShell}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
        </View>
        <AppText muted style={styles.eyebrow}>{state.visitLabel}</AppText>
      </View>

      {loading ? (
        <View style={styles.loadingBlock}>
          <AppText weight="bold" style={styles.title}>نقرأ آخر حركة في عالمك...</AppText>
          <AppText muted>لحظات ونرتّب لك المشهد بشكل أوضح.</AppText>
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
                <AppText weight="semibold" style={styles.signalValue}>{signal.value}</AppText>
                <AppText style={styles.signalLabel}>{signal.label}</AppText>
              </View>
            ))}
          </View>
          {state.primaryActionLabel && state.primaryActionRoute ? (
            <Pressable style={styles.ctaButton} onPress={onPrimaryAction}>
              <AppText weight="semibold" style={styles.ctaText}>{state.primaryActionLabel}</AppText>
              <Ionicons name="arrow-back-outline" size={15} color="#fff" />
            </Pressable>
          ) : null}
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.md, overflow: 'hidden' },
  orbPrimary: { position: 'absolute', width: 138, height: 138, borderRadius: radii.round, top: -44, right: -38, backgroundColor: 'rgba(184,98,63,0.09)' },
  orbAccent: { position: 'absolute', width: 104, height: 104, borderRadius: radii.round, bottom: -32, left: -24, backgroundColor: 'rgba(62,124,115,0.1)' },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  iconShell: { width: 34, height: 34, borderRadius: radii.round, borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', backgroundColor: 'rgba(255,253,248,0.74)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12 },
  loadingBlock: { gap: spacing.xs },
  copyBlock: { gap: spacing.xs },
  title: { fontSize: 20, lineHeight: 28 },
  body: { lineHeight: 22 },
  signalsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  signalPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 7 },
  signalValue: { fontSize: 12 },
  signalLabel: { fontSize: 12 },
  ctaButton: { marginTop: spacing.xs, alignSelf: 'flex-end', flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, borderRadius: radii.round, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ctaText: { color: '#fff' },
});
