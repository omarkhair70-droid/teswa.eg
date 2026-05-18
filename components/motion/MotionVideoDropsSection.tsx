import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
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

function PlayAura() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);

    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse]);

  const auraStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + pulse.value * 0.18,
    transform: [{ scale: 1 + pulse.value * 0.18 }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.playAura, auraStyle]} />;
}

function InactiveVideoSurface({ available, onPlay }: { available: boolean; onPlay: () => void }) {
  const content = (
    <>
      <LinearGradient colors={[colors.primary, colors.accent, '#1F2D2A']} start={{ x: 0.05, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.softOrbPrimary} />
      <View style={styles.softOrbAccent} />
      <LinearGradient colors={['rgba(255,253,248,0.16)', 'rgba(29,26,22,0.18)', 'rgba(29,26,22,0.62)']} style={StyleSheet.absoluteFill} />
      <View style={styles.previewTexture} />

      <View style={styles.playCluster}>
        {available ? <PlayAura /> : null}
        <View style={[styles.playButton, !available && styles.playButtonUnavailable]}>
          <AppText weight="bold" style={styles.playIcon}>{available ? '▶' : '—'}</AppText>
        </View>
        <BlurView intensity={14} tint="dark" style={styles.videoMicroBadge}>
          <AppText style={styles.videoMicroText}>{available ? 'اضغط للتشغيل' : 'الفيديو غير متاح الآن'}</AppText>
        </BlurView>
      </View>
    </>
  );

  if (!available) {
    return <View style={styles.previewSurface}>{content}</View>;
  }

  return (
    <Pressable style={styles.previewSurface} onPress={onPlay} accessibilityRole="button" accessibilityLabel="تشغيل لقطة الفيديو">
      {content}
    </Pressable>
  );
}

function MotionVideoDropCard({ drop, active, onPlay, onStop }: { drop: MotionVideoDrop; active: boolean; onPlay: () => void; onStop: () => void }) {
  const displayName = useMemo(() => drop.authorDisplayName?.trim() || (drop.authorUsername ? `@${drop.authorUsername}` : 'مستخدم'), [drop.authorDisplayName, drop.authorUsername]);
  const initial = displayName.charAt(0).toUpperCase();
  const durationLabel = drop.durationMs != null ? `${Math.max(0, Math.round(drop.durationMs / 1000))}ث` : null;

  return (
    <View style={[styles.card, active && styles.cardActive]}>
      <View style={[styles.mediaFrame, active && styles.mediaFrameActive]}>
        {active && drop.signedVideoUrl ? <ActiveVideoPreview signedVideoUrl={drop.signedVideoUrl} /> : <InactiveVideoSurface available={Boolean(drop.signedVideoUrl)} onPlay={onPlay} />}

        {active ? (
          <BlurView intensity={16} tint="dark" style={styles.activeStatusBadge}>
            <View style={styles.liveDot} />
            <AppText weight="semibold" style={styles.activeStatusText}>يعمل الآن</AppText>
          </BlurView>
        ) : null}

        <View style={styles.overlay}>
          <BlurView intensity={18} tint="dark" style={styles.authorGlass}>
            <View style={styles.authorRow}>
              {drop.authorAvatarUrl ? (
                <ExpoImage source={{ uri: drop.authorAvatarUrl }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={100} />
              ) : (
                <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarFallbackText}>{initial}</AppText></View>
              )}
              <AppText weight="semibold" numberOfLines={1} style={styles.authorName}>{displayName}</AppText>
            </View>
          </BlurView>
          {durationLabel ? (
            <BlurView intensity={18} tint="dark" style={styles.durationPill}>
              <AppText weight="semibold" style={styles.durationText}>{durationLabel}</AppText>
            </BlurView>
          ) : null}
        </View>
      </View>

      {drop.caption ? (
        <View style={styles.captionBox}>
          <AppText numberOfLines={2} style={styles.captionText}>{drop.caption}</AppText>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {drop.signedVideoUrl ? active ? <AppButton label="إيقاف" variant="neutral" onPress={onStop} /> : <AppButton label="تشغيل" variant="primary" onPress={onPlay} /> : null}

        <Pressable style={styles.openStoryButton} onPress={() => router.push(`/story/${drop.authorId}`)}>
          <AppText weight="semibold" style={styles.openStoryText}>افتح القصة</AppText>
        </Pressable>
      </View>
    </View>
  );
}

export function MotionVideoDropsSection({ drops, loading, error, onRetry }: MotionVideoDropsSectionProps) {
  const [activeDropId, setActiveDropId] = useState<string | null>(null);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText weight="bold" style={styles.sectionTitle}>لقطات من النبض</AppText>
        <AppText muted style={styles.sectionIntro}>فيديوهات قصيرة من القصص اللي بتحرك عالم تِسوى الآن.</AppText>
        <AppText style={styles.sectionMicro}>ريل سينمائي من لحظات حية</AppText>
      </View>

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
  sectionHeader: { gap: spacing.xs },
  sectionTitle: { fontSize: 18 },
  sectionIntro: { lineHeight: 21 },
  sectionMicro: { alignSelf: 'flex-start', color: colors.primary, fontSize: 12, letterSpacing: 0.2 },
  stateBox: { gap: spacing.sm, paddingVertical: spacing.xs },
  errorText: { color: '#B42318' },
  rail: { gap: spacing.sm, paddingVertical: spacing.xs },
  card: {
    width: 204,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  cardActive: {
    borderColor: 'rgba(62,124,115,0.5)',
    backgroundColor: '#FFF9F1',
  },
  mediaFrame: {
    height: 260,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#241A15',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  mediaFrameActive: { borderColor: 'rgba(255,253,248,0.6)' },
  media: { width: '100%', height: '100%' },
  previewSurface: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  softOrbPrimary: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(238,216,203,0.32)', top: -54, right: -62 },
  softOrbAccent: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(62,124,115,0.34)', bottom: -42, left: -50 },
  previewTexture: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  playCluster: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  playAura: {
    position: 'absolute',
    top: -10,
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    borderColor: 'rgba(255,253,248,0.85)',
    backgroundColor: 'rgba(255,253,248,0.1)',
  },
  playButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  playButtonUnavailable: { backgroundColor: 'rgba(255,253,248,0.58)' },
  playIcon: { color: colors.primary, fontSize: 20, marginLeft: 2 },
  videoMicroBadge: {
    overflow: 'hidden',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  videoMicroText: { color: colors.white, fontSize: 12 },
  activeStatusBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    overflow: 'hidden',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#9AF2C4' },
  activeStatusText: { color: colors.white, fontSize: 12 },
  overlay: { position: 'absolute', left: spacing.xs, right: spacing.xs, bottom: spacing.xs, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs },
  authorGlass: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avatar: { width: 26, height: 26, borderRadius: radii.round, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  avatarFallback: { width: 26, height: 26, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: colors.primary, fontSize: 12 },
  authorName: { color: colors.white, flex: 1, fontSize: 13 },
  durationPill: {
    overflow: 'hidden',
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  durationText: { color: colors.white, fontSize: 12 },
  captionBox: {
    borderRadius: radii.md,
    backgroundColor: 'rgba(238,216,203,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  captionText: { color: colors.text, lineHeight: 21 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  openStoryButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  openStoryText: { color: colors.textMuted },
});
