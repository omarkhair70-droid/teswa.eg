import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DiscoverIntelligenceState, DiscoverIntelligenceSignalTone } from '@/lib/discover-intelligence';

type Props = { state: DiscoverIntelligenceState };
type IoniconName = ComponentProps<typeof Ionicons>['name'];

const toneMap: Record<DiscoverIntelligenceState['tone'], { icon: IoniconName; color: string; soft: string }> = {
  alive: { icon: 'sparkles-outline', color: colors.accent, soft: 'rgba(62,124,115,0.11)' },
  story: { icon: 'book-outline', color: '#A96A32', soft: 'rgba(169,106,50,0.11)' },
  visual: { icon: 'videocam-outline', color: '#527DC4', soft: 'rgba(82,125,196,0.11)' },
  filtered: { icon: 'options-outline', color: colors.accent, soft: 'rgba(62,124,115,0.11)' },
  calm: { icon: 'compass-outline', color: colors.primary, soft: 'rgba(184,98,63,0.1)' },
};

const signalToneMap: Record<DiscoverIntelligenceSignalTone, string> = {
  items: colors.primary,
  video: '#527DC4',
  stories: '#A96A32',
  filters: colors.accent,
  quiet: colors.textMuted,
};

export function DiscoverIntelligencePanel({ state }: Props) {
  const tone = toneMap[state.tone];

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconShell, { backgroundColor: tone.soft }]}>
        <Ionicons name={tone.icon} size={20} color={tone.color} />
      </View>
      <View style={styles.mainContent}>
        <AppText weight="semibold" style={[styles.eyebrow, { color: tone.color }]}>{state.eyebrow}</AppText>
        <AppText weight="bold" style={styles.title}>{state.title}</AppText>
        <AppText muted style={styles.body}>{state.body}</AppText>
        <View style={styles.signalsRow}>
          {state.signals.map((signal) => (
            <View key={signal.key} style={styles.signal}>
              <View style={[styles.signalDot, { backgroundColor: signalToneMap[signal.tone] }]} />
              <AppText weight="bold" style={styles.signalValue}>{signal.value}</AppText>
              <AppText muted style={styles.signalLabel}>{signal.label}</AppText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.14)',
    padding: spacing.md,
    backgroundColor: 'rgba(255,253,248,0.86)',
  },
  iconShell: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 11 },
  title: { fontSize: 18, lineHeight: 25 },
  body: { fontSize: 12, lineHeight: 19 },
  signalsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  signal: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(116,106,97,0.14)',
    backgroundColor: colors.white,
  },
  signalDot: { width: 5, height: 5, borderRadius: radii.round },
  signalValue: { fontSize: 11 },
  signalLabel: { fontSize: 10 },
});
