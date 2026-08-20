import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type VoiceMessageBubbleProps = {
  mine: boolean;
  durationMs?: number | null;
  positionMs?: number | null;
  playing?: boolean;
  loading?: boolean;
  onPress: () => void;
  compact?: boolean;
};

const WAVE = [7, 12, 18, 9, 15, 21, 12, 18, 8, 14, 23, 16, 10, 20, 13, 17, 8, 15, 22, 12, 18, 9, 14, 19, 10, 16, 12, 20];

function formatDuration(valueMs: number) {
  const seconds = Math.max(0, Math.floor(valueMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const createStyles = (colors: TeswaThemeColors) => ({
  shell: { width: 248, maxWidth: '100%' as const, minHeight: 58, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 4 },
  shellCompact: { width: 220 },
  playButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center' as const, justifyContent: 'center' as const },
  playButtonMine: { backgroundColor: 'rgba(255,255,255,0.14)' },
  playButtonOther: { backgroundColor: colors.primarySoft },
  playIcon: { transform: [{ translateX: 1 }] },
  body: { flex: 1, gap: 5 },
  waveRow: { height: 28, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: 2 },
  waveBar: { width: 3, borderRadius: 2 },
  metaRow: { flexDirection: 'row-reverse' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  duration: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  mineMeta: { color: 'rgba(255,255,255,0.72)' },
  pressed: { opacity: 0.68 },
});

export function VoiceMessageBubble({
  mine,
  durationMs = 0,
  positionMs = 0,
  playing = false,
  loading = false,
  onPress,
  compact = false,
}: VoiceMessageBubbleProps) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const safeDuration = Math.max(0, durationMs ?? 0);
  const safePosition = Math.max(0, Math.min(positionMs ?? 0, safeDuration || Number.MAX_SAFE_INTEGER));
  const ratio = safeDuration > 0 ? Math.min(1, safePosition / safeDuration) : 0;
  const completedBars = Math.round(ratio * WAVE.length);
  const primary = mine ? colors.white : colors.primary;
  const muted = mine ? 'rgba(255,255,255,0.42)' : colors.primarySoft;
  const durationLabel = safeDuration > 0
    ? (playing ? `${formatDuration(safePosition)} / ${formatDuration(safeDuration)}` : formatDuration(safeDuration))
    : (playing && safePosition > 0 ? formatDuration(safePosition) : '--:--');

  return (
    <View style={[styles.shell, compact && styles.shellCompact]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'إيقاف الرسالة الصوتية مؤقتًا' : 'تشغيل الرسالة الصوتية'}
        hitSlop={7}
        onPress={onPress}
        style={({ pressed }) => [styles.playButton, mine ? styles.playButtonMine : styles.playButtonOther, pressed && styles.pressed]}
      >
        {loading ? <ActivityIndicator size="small" color={primary} /> : <Ionicons name={playing ? 'pause' : 'play'} size={18} color={primary} style={!playing ? styles.playIcon : undefined} />}
      </Pressable>
      <View style={styles.body}>
        <View style={styles.waveRow} accessibilityElementsHidden>
          {WAVE.map((height, index) => <View key={`voice-wave-${index}`} style={[styles.waveBar, { height, backgroundColor: index < completedBars ? primary : muted }]} />)}
        </View>
        <View style={styles.metaRow}>
          <AppText style={[styles.duration, mine && styles.mineMeta]}>{durationLabel}</AppText>
          <Ionicons name="mic" size={12} color={mine ? 'rgba(255,255,255,0.70)' : colors.textMuted} />
        </View>
      </View>
    </View>
  );
}
