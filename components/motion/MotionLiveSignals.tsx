import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MotionLiveSignalsState, MotionLiveSignalTone } from '@/lib/motion-live-signals';

type MotionLiveSignalsProps = {
  state: MotionLiveSignalsState;
};

const toneStyles: Record<MotionLiveSignalTone, { borderColor: string; backgroundColor: string }> = {
  video: {
    borderColor: 'rgba(255,255,255,0.36)',
    backgroundColor: 'rgba(255,255,255,0.19)',
  },
  stories: {
    borderColor: 'rgba(238,216,203,0.52)',
    backgroundColor: 'rgba(238,216,203,0.18)',
  },
  moving: {
    borderColor: 'rgba(62,124,115,0.42)',
    backgroundColor: 'rgba(62,124,115,0.20)',
  },
  stories_items: {
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
};

export function MotionLiveSignals({ state }: MotionLiveSignalsProps) {
  return (
    <BlurView intensity={18} tint="light" style={styles.surface}>
      <View style={styles.copyBlock}>
        <AppText weight="bold" style={styles.moodLabel}>
          {state.moodLabel}
        </AppText>
        <AppText style={styles.moodBody}>{state.moodBody}</AppText>
      </View>
      <View style={styles.signalsRow}>
        {state.signals.map((signal, index) => {
          const toneStyle = signal.tone ? toneStyles[signal.tone] : undefined;

          return (
            <Animated.View
              key={signal.key}
              entering={FadeInUp.duration(260).delay(70 + index * 45)}
              style={[styles.signalPill, toneStyle]}
            >
              <AppText weight="bold" style={styles.signalValue}>
                {signal.value}
              </AppText>
              <AppText style={styles.signalLabel}>{signal.label}</AppText>
            </Animated.View>
          );
        })}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.13)',
    overflow: 'hidden',
    padding: spacing.md,
    gap: spacing.sm,
  },
  copyBlock: { gap: spacing.xs },
  moodLabel: { color: colors.white, fontSize: 15 },
  moodBody: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    lineHeight: 20,
  },
  signalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  signalPill: {
    minWidth: 96,
    flexGrow: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  signalValue: { color: colors.white, fontSize: 17 },
  signalLabel: { color: 'rgba(255,255,255,0.86)', fontSize: 11 },
});
