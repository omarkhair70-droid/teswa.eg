import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { shadows } from '@/constants/shadows';
import { spacing } from '@/constants/spacing';
import type {
  ProfilePresenceSignal,
  ProfilePresenceState,
  ProfilePresenceTone,
} from '@/lib/profile-presence';

type ProfilePresenceSignalsProps = {
  presence: ProfilePresenceState;
};

const toneStyles: Record<
  ProfilePresenceTone,
  { backgroundColor: string; borderColor: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  stories: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.23)',
    color: '#8A4B12',
    icon: 'play-circle-outline',
  },
  items: {
    backgroundColor: 'rgba(184,98,63,0.1)',
    borderColor: 'rgba(184,98,63,0.18)',
    color: colors.primary,
    icon: 'cube-outline',
  },
  trust: {
    backgroundColor: 'rgba(62,124,115,0.11)',
    borderColor: 'rgba(62,124,115,0.2)',
    color: colors.accent,
    icon: 'ribbon-outline',
  },
  reply: {
    backgroundColor: 'rgba(29,26,22,0.055)',
    borderColor: 'rgba(29,26,22,0.1)',
    color: colors.text,
    icon: 'chatbubble-ellipses-outline',
  },
};

function SmallSignal({ signal }: { signal: ProfilePresenceSignal }) {
  const tone = signal.tone ? toneStyles[signal.tone] : toneStyles.reply;

  return (
    <View
      style={[
        styles.smallSignal,
        { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor },
      ]}
    >
      <View style={styles.smallSignalHeader}>
        <Ionicons name={tone.icon} size={14} color={tone.color} />
        <AppText muted numberOfLines={1} style={styles.smallSignalLabel}>{signal.label}</AppText>
      </View>
      <AppText weight="bold" numberOfLines={1} style={[styles.smallSignalValue, { color: tone.color }]}>
        {signal.value}
      </AppText>
    </View>
  );
}

export function ProfilePresenceSignals({ presence }: ProfilePresenceSignalsProps) {
  const trustSignal = presence.signals.find((signal) => signal.key === 'trust') ?? presence.signals[0];
  const secondarySignals = presence.signals.filter((signal) => signal !== trustSignal);
  const trustTone = trustSignal?.tone ? toneStyles[trustSignal.tone] : toneStyles.trust;

  return (
    <View style={styles.card}>
      <View style={styles.softOrb} />

      <View style={styles.introRow}>
        <View style={styles.introIcon}>
          <Ionicons name="leaf-outline" size={22} color="#8A624B" />
        </View>
        <View style={styles.copy}>
          <AppText weight="bold" style={styles.headline}>{presence.headline}</AppText>
          <AppText muted style={styles.body}>{presence.body}</AppText>
        </View>
      </View>

      {trustSignal ? (
        <View
          style={[
            styles.primarySignal,
            {
              backgroundColor: trustTone.backgroundColor,
              borderColor: trustTone.borderColor,
            },
          ]}
        >
          <View style={styles.primarySignalIcon}>
            <Ionicons name={trustTone.icon} size={24} color={trustTone.color} />
          </View>
          <View style={styles.primarySignalCopy}>
            <AppText muted style={styles.primarySignalLabel}>{trustSignal.label}</AppText>
            <AppText weight="bold" style={[styles.primarySignalValue, { color: trustTone.color }]}>
              {trustSignal.value}
            </AppText>
          </View>
          <View style={styles.primarySignalMark}>
            <Ionicons name="checkmark-circle" size={18} color={trustTone.color} />
          </View>
        </View>
      ) : null}

      {secondarySignals.length > 0 ? (
        <View style={styles.secondarySignals}>
          {secondarySignals.map((signal) => <SmallSignal key={signal.key} signal={signal} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: 'rgba(255,253,248,0.94)',
    ...shadows.card,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  softOrb: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    left: -48,
    top: -62,
    backgroundColor: 'rgba(238,216,203,0.26)',
  },
  introRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(238,216,203,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.09)',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  headline: {
    fontSize: 18,
    lineHeight: 26,
  },
  body: {
    fontSize: 13,
    lineHeight: 21,
  },
  primarySignal: {
    minHeight: 88,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primarySignalIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.72)',
  },
  primarySignalCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  primarySignalLabel: {
    fontSize: 12,
  },
  primarySignalValue: {
    fontSize: 24,
    lineHeight: 30,
  },
  primarySignalMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.58)',
  },
  secondarySignals: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  smallSignal: {
    flexGrow: 1,
    minWidth: 104,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  smallSignalHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  smallSignalLabel: {
    flexShrink: 1,
    fontSize: 10,
  },
  smallSignalValue: {
    fontSize: 14,
  },
});
