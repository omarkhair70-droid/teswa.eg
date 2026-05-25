import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import type { DolabSelfMessage } from '@/lib/dolab/self-chat-types';

type Props = { message: DolabSelfMessage; pendingMedia: DolabPendingMedia[] };

export function DolabVoiceNoteBubble({ message, pendingMedia }: Props) {
  const linkedAudio = useMemo(
    () => pendingMedia.find((media) => message.linkedPendingMediaIds.includes(media.id) && media.mediaType === 'audio' && !!media.uri),
    [message.linkedPendingMediaIds, pendingMedia],
  );
  const player = useAudioPlayer(linkedAudio?.uri ?? null, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerStatus.didJustFinish) return;
    player.pause();
    void player.seekTo(0).catch(() => undefined);
  }, [player, playerStatus.didJustFinish]);

  const togglePlayback = async () => {
    if (!linkedAudio?.uri) return;
    try {
      setError(null);
      if (playerStatus.playing) {
        player.pause();
      } else {
        await player.play();
      }
    } catch {
      setError('تعذر تشغيل التسجيل حاليًا.');
    }
  };

  const durationLabel = linkedAudio?.durationMs
    ? `${Math.max(1, Math.round(linkedAudio.durationMs / 1000))}ث`
    : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="mic" size={14} color={colors.primary} />
        <AppText weight="semibold" style={styles.title}>تسجيل صوتي</AppText>
      </View>
      <AppText>{message.body}</AppText>
      <AppText muted style={styles.meta}>ميديا مرتبطة: {message.linkedPendingMediaIds.length}</AppText>
      {durationLabel ? <AppText muted style={styles.meta}>المدة: {durationLabel}</AppText> : null}
      {linkedAudio?.uri ? (
        <Pressable style={styles.playBtn} onPress={() => { void togglePlayback(); }}>
          <AppText style={styles.playText}>{playerStatus.playing ? 'إيقاف' : 'تشغيل'}</AppText>
        </Pressable>
      ) : (
        <AppText muted style={styles.meta}>التسجيل مش متاح للتشغيل دلوقتي.</AppText>
      )}
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      {playerStatus.didJustFinish ? <AppText muted style={styles.meta}>انتهى التشغيل.</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  title: { color: colors.primary },
  meta: { fontSize: 12 },
  playBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primarySoft,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  playText: { color: colors.primary, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
});
