import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { PulseViewerEntry } from '@/lib/pulse-video-viewer';
import { buildCachedVideoSource } from '@/lib/media/media-performance';

function formatDuration(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function ActiveVideo({ url, paused, onReady, onError }: { url: string; paused: boolean; onReady?: () => void; onError?: () => void }) {
  const source = buildCachedVideoSource(url);
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.play();
  });
  const readyRef = useRef(false);

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (error) onError?.();
    if (status === 'readyToPlay' && !readyRef.current) {
      readyRef.current = true;
      onReady?.();
    }
  });

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  return <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls={false} allowsPictureInPicture={false} fullscreenOptions={{ enable: false }} />;
}

export function PulseViewerVideoPage({ entry, active }: { entry: PulseViewerEntry; active: boolean }) {
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const durationLabel = useMemo(() => formatDuration(entry.durationMs), [entry.durationMs]);

  useEffect(() => { setPaused(false); }, [entry.id, active]);
  useEffect(() => { setReady(false); setFailed(false); }, [entry.id]);

  const ctaLabel = entry.kind === 'story_video' ? 'افتح القصة' : 'افتح العنصر';

  return (
    <View style={styles.page}>
      {active ? <ActiveVideo url={entry.signedVideoUrl} paused={paused} onReady={() => setReady(true)} onError={() => setFailed(true)} /> : null}
      {!active ? <LinearGradient colors={['#130F10', '#2B1C16', '#101012']} style={StyleSheet.absoluteFill} /> : null}
      {active && !ready && !failed ? <LinearGradient colors={['#130F10', '#2B1C16', '#101012']} style={StyleSheet.absoluteFill} /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.64)']} style={StyleSheet.absoluteFill} />
      {active && !ready && !failed ? <View pointerEvents="none" style={styles.loadingOverlay}><AppText style={styles.loadingText}>نجهّز المشهد...</AppText></View> : null}

      <View style={styles.overlay}>
        <View style={styles.pillsRow}>
          <BlurView intensity={20} tint="dark" style={styles.pill}><AppText style={styles.pillText}>{entry.kind === 'story_video' ? 'قصة فيديو' : 'لمحة عنصر'}</AppText></BlurView>
          {durationLabel ? <BlurView intensity={20} tint="dark" style={styles.pill}><AppText style={styles.pillText}>{durationLabel}</AppText></BlurView> : null}
        </View>

        {entry.kind === 'story_video' ? (
          <View style={styles.body}>
            <View style={styles.authorRow}>
              {entry.authorAvatarUrl ? <ExpoImage source={{ uri: entry.authorAvatarUrl }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={100} /> : <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarText}>{(entry.authorDisplayName || entry.authorUsername || 'م').charAt(0)}</AppText></View>}
              <AppText weight="bold" style={styles.title}>{entry.authorDisplayName?.trim() || (entry.authorUsername ? `@${entry.authorUsername}` : 'مستخدم')}</AppText>
            </View>
            {entry.caption ? <AppText numberOfLines={3} style={styles.description}>{entry.caption}</AppText> : null}
          </View>
        ) : (
          <View style={styles.body}>
            <AppText weight="bold" numberOfLines={2} style={styles.title}>{entry.title}</AppText>
            {!!entry.ownerDisplayName && <AppText style={styles.description}>بواسطة {entry.ownerDisplayName}</AppText>}
            <AppText numberOfLines={1} style={styles.description}>{[entry.category, entry.location, entry.condition].filter(Boolean).join(' • ')}</AppText>
            {entry.description ? <AppText numberOfLines={2} style={styles.description}>{entry.description}</AppText> : null}
          </View>
        )}

        <View style={styles.actions}>
          {active ? <Pressable style={styles.pauseBtn} onPress={() => setPaused((v) => !v)}><AppText weight="semibold" style={styles.pauseText}>{paused ? 'تشغيل' : 'إيقاف'}</AppText></Pressable> : null}
          <Pressable style={styles.ctaBtn} onPress={() => router.push(entry.kind === 'story_video' ? `/story/${entry.authorId}` : `/item/${entry.itemId}`)}><AppText weight="bold" style={styles.ctaText}>{ctaLabel}</AppText></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0B0C' }, overlay: { flex: 1, justifyContent: 'flex-end', padding: spacing.md, gap: spacing.sm },
  pillsRow: { flexDirection: 'row-reverse', gap: spacing.xs }, pill: { borderRadius: radii.round, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  pillText: { color: '#FFF', fontSize: 12 }, body: { gap: spacing.xs }, authorRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs }, avatar: { width: 34, height: 34, borderRadius: 17 }, avatarFallback: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff' },
  title: { color: '#fff', fontSize: 20 }, description: { color: 'rgba(255,255,255,0.9)' }, actions: { flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center' },
  ctaBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.round }, ctaText: { color: '#fff' }, pauseBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.round }, pauseText: { color: '#fff' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radii.round, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
});
