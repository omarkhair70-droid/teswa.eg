import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DiscoverIntelligenceState } from '@/lib/discover-intelligence';

type Props = { state: DiscoverIntelligenceState };

const toneMap = {
  alive: ['#FFF3DD', '#FEE8CC', 'rgba(56,142,96,0.28)'],
  story: ['#FFF7EC', '#FBEEDC', 'rgba(185,129,77,0.22)'],
  visual: ['#F6F0FF', '#E6EFFF', 'rgba(84,132,220,0.24)'],
  filtered: ['#EDF7FF', '#E2F0FF', 'rgba(35,116,107,0.3)'],
  calm: ['#FFF9F1', '#F7EFE2', 'rgba(110,110,110,0.14)'],
} as const;

export function DiscoverIntelligencePanel({ state }: Props) {
  return (
    <LinearGradient colors={toneMap[state.tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wrap}>
      <View style={styles.orbOne} />
      <View style={styles.orbTwo} />
      <View style={styles.textBox}>
        <AppText style={styles.eyebrow}>{state.eyebrow}</AppText>
        <AppText weight="bold" style={styles.title}>{state.title}</AppText>
        <AppText>{state.body}</AppText>
      </View>
      <View style={styles.pillsRow}>
        {state.signals.map((signal) => (
          <View key={signal.key} style={styles.pill}>
            <Ionicons name={signal.icon as never} size={14} color={colors.primary} />
            <AppText weight="bold">{signal.value}</AppText>
            <AppText muted>{signal.label}</AppText>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(62,124,115,0.2)',
    padding: spacing.md,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  orbOne: { position: 'absolute', top: -30, right: -20, width: 110, height: 110, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.33)' },
  orbTwo: { position: 'absolute', bottom: -35, left: -24, width: 100, height: 100, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
  textBox: { gap: spacing.xs },
  eyebrow: { fontSize: 12, color: colors.primary },
  title: { fontSize: 20 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(62,124,115,0.2)',
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
});
