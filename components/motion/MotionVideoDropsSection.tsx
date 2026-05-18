import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MotionVideoDrop } from '@/lib/motion-video-drops';

export type MotionVideoDropsSectionProps = {
  drops: MotionVideoDrop[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

function ActiveVideoPreview({ signedVideoUrl }: { signedVideoUrl: string }) {
  const player = useVideoPlayer(signedVideoUrl, (instance) => {
    instance.loop = true;
    instance.play();
  });

  return <VideoView style={styles.media} player={player} nativeControls={false} fullscreenOptions={{ enable: false }} allowsPictureInPicture={false} />;
}

function MotionVideoDropCard({ drop, active, onPlay, onStop }: { drop: MotionVideoDrop; active: boolean; onPlay: () => void; onStop: () => void }) {
  const displayName = useMemo(() => drop.authorDisplayName?.trim() || (drop.authorUsername ? `@${drop.authorUsername}` : 'مستخدم'), [drop.authorDisplayName, drop.authorUsername]);
  const initial = displayName.charAt(0).toUpperCase();
  const durationLabel = drop.durationMs != null ? `${Math.max(0, Math.round(drop.durationMs / 1000))}ث` : null;

  return (
    <View style={styles.card}>
      <View style={styles.mediaFrame}>
        {active && drop.signedVideoUrl ? <ActiveVideoPreview signedVideoUrl={drop.signedVideoUrl} /> : <View style={styles.placeholder}><AppText muted>{drop.signedVideoUrl ? 'اضغط تشغيل لمعاينة الفيديو' : 'الفيديو غير متاح الآن'}</AppText></View>}

        <View style={styles.overlay}>
          <View style={styles.authorRow}>
            {drop.authorAvatarUrl ? (
              <ExpoImage source={{ uri: drop.authorAvatarUrl }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={100} />
            ) : (
              <View style={styles.avatarFallback}><AppText weight="bold">{initial}</AppText></View>
            )}
            <AppText weight="semibold" numberOfLines={1} style={styles.authorName}>{displayName}</AppText>
          </View>
          {durationLabel ? <View style={styles.durationPill}><AppText style={styles.durationText}>{durationLabel}</AppText></View> : null}
        </View>
      </View>

      {drop.caption ? <AppText numberOfLines={2}>{drop.caption}</AppText> : null}

      <View style={styles.actionsRow}>
        {drop.signedVideoUrl ? active ? <AppButton label="إيقاف" variant="neutral" onPress={onStop} /> : <AppButton label="تشغيل" variant="primary" onPress={onPlay} /> : null}

        <Pressable style={styles.openStoryButton} onPress={() => router.push(`/story/${drop.authorId}`)}>
          <AppText style={styles.openStoryText}>افتح القصة</AppText>
        </Pressable>
      </View>
    </View>
  );
}

export function MotionVideoDropsSection({ drops, loading, error, onRetry }: MotionVideoDropsSectionProps) {
  const [activeDropId, setActiveDropId] = useState<string | null>(null);

  return (
    <View style={styles.section}>
      <AppText weight="bold">لقطات من النبض</AppText>
      <AppText muted>فيديوهات قصيرة من القصص اللي بتحرك عالم تِسوى الآن.</AppText>

      {loading ? <AppText muted>نجهّز لقطات الفيديو من النبض...</AppText> : null}

      {!loading && error ? (
        <View style={styles.stateBox}>
          <AppText style={styles.errorText}>تعذر تحميل لقطات الفيديو الآن.</AppText>
          <AppButton label="إعادة المحاولة" variant="neutral" onPress={onRetry} />
        </View>
      ) : null}

      {!loading && !error && drops.length === 0 ? <AppText muted>لسه مفيش لقطات فيديو نشطة في النبض.</AppText> : null}

      {!loading && !error && drops.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {drops.map((drop) => (
            <MotionVideoDropCard
              key={drop.storyId}
              drop={drop}
              active={activeDropId === drop.storyId}
              onPlay={() => setActiveDropId(drop.storyId)}
              onStop={() => {
                if (activeDropId === drop.storyId) {
                  setActiveDropId(null);
                }
              }}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  stateBox: { gap: spacing.sm, paddingVertical: spacing.xs },
  errorText: { color: '#B42318' },
  rail: { gap: spacing.sm, paddingVertical: spacing.xs },
  card: {
    width: 196,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  mediaFrame: { height: 260, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.background },
  media: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  overlay: { position: 'absolute', left: spacing.xs, right: spacing.xs, bottom: spacing.xs, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radii.round, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  avatar: { width: 24, height: 24, borderRadius: radii.round },
  avatarFallback: { width: 24, height: 24, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  authorName: { color: colors.white, maxWidth: 96 },
  durationPill: { backgroundColor: 'rgba(0,0,0,0.52)', borderRadius: radii.round, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  durationText: { color: colors.white, fontSize: 12 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  openStoryButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  openStoryText: { color: colors.textMuted },
});
