import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { ProfilePresenceSignal, ProfilePresenceState, ProfilePresenceTone } from '@/lib/profile-presence';

type ProfilePresenceSignalsProps = {
  presence: ProfilePresenceState;
};

const toneStyles: Record<ProfilePresenceTone, { backgroundColor: string; borderColor: string; color: string }> = {
  stories: { backgroundColor: 'rgba(245,158,11,0.13)', borderColor: 'rgba(245,158,11,0.27)', color: '#8A4B12' },
  items: { backgroundColor: 'rgba(184,98,63,0.12)', borderColor: 'rgba(184,98,63,0.24)', color: colors.primary },
  trust: { backgroundColor: 'rgba(62,124,115,0.12)', borderColor: 'rgba(62,124,115,0.24)', color: colors.accent },
  reply: { backgroundColor: 'rgba(29,26,22,0.07)', borderColor: 'rgba(29,26,22,0.12)', color: colors.text },
};

function SignalPill({ signal }: { signal: ProfilePresenceSignal }) {
  const tone = signal.tone ? toneStyles[signal.tone] : toneStyles.reply;

  return (
    <View style={[styles.signalPill, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
      <AppText muted style={styles.signalLabel}>{signal.label}</AppText>
      <AppText weight="bold" style={[styles.signalValue, { color: tone.color }]}>{signal.value}</AppText>
    </View>
  );
}

export function ProfilePresenceSignals({ presence }: ProfilePresenceSignalsProps) {
  return (
    <View style={styles.card}>
      <View style={styles.copy}>
        <AppText weight="bold" style={styles.headline}>{presence.headline}</AppText>
        <AppText muted style={styles.body}>{presence.body}</AppText>
      </View>
      <View style={styles.signalsRow}>
        {presence.signals.map((signal) => <SignalPill key={signal.key} signal={signal} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: 'rgba(255,253,248,0.9)',
  },
  copy: { gap: spacing.xs },
  headline: { fontSize: 17, lineHeight: 24 },
  body: { fontSize: 13, lineHeight: 20 },
  signalsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  signalPill: {
    flexGrow: 1,
    minWidth: 88,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  signalLabel: { fontSize: 11 },
  signalValue: { fontSize: 14 },
});
