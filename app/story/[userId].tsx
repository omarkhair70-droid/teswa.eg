import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEventListener } from 'expo';
import { Image as ExpoImage } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/lib/auth';
import { StoryRecord, StoryViewerContext, createStoryMediaSignedUrl, fetchStoryViewerContextByUserId } from '@/lib/stories';

const IMAGE_DURATION_MS = 5000;
const VIDEO_FALLBACK_DURATION_MS = 8000;

function StoryVideo({
  uri,
  active,
  onError,
  onReady,
}: {
  uri: string;
  active: boolean;
  onError: () => void;
  onReady?: () => void;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });
  const readyRef = useRef(false);

  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (error) onError();
    if (status === 'readyToPlay' && !readyRef.current) {
      readyRef.current = true;
      onReady?.();
      if (active) {
        player.play();
      }
    }
  });

  useEffect(() => {
    if (active) {
      if (readyRef.current) {
        player.play();
      }
    } else {
      player.pause();
    }
  }, [active, player]);

  return (
    <VideoView
      style={styles.media}
      player={player}
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}

export default function StoryViewerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const normalizedUserId = userId?.trim() ?? '';
  const isViewingOwnStories = !!user?.id && normalizedUserId === user.id;
  const pagerRef = useRef<PagerView>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<StoryViewerContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlsByStoryId, setUrlsByStoryId] = useState<Record<string, string | null>>({});
  const [mediaFailedIds, setMediaFailedIds] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [readyVideoStoryIds, setReadyVideoStoryIds] = useState<Record<string, boolean>>({});

  const closeViewer = useCallback(() => {
    router.back();
  }, [router]);

  const goToIndex = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
    setActiveIndex(index);
  }, []);

  const goNext = useCallback(() => {
    const total = context?.stories.length ?? 0;
    if (!total) return closeViewer();
    if (activeIndex >= total - 1) return closeViewer();
    goToIndex(activeIndex + 1);
  }, [activeIndex, closeViewer, context?.stories.length, goToIndex]);

  const goPrevious = useCallback(() => {
    if (activeIndex <= 0) return goToIndex(0);
    goToIndex(activeIndex - 1);
  }, [activeIndex, goToIndex]);

  useEffect(() => {
    if (!normalizedUserId) {
      setError('invalid_user');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const viewerContext = await fetchStoryViewerContextByUserId(normalizedUserId);
        if (!viewerContext || !viewerContext.stories.length) {
          if (!cancelled) setError('empty');
          return;
        }

        const pairs = await Promise.all(viewerContext.stories.map(async (story) => {
          const signedUrl = await createStoryMediaSignedUrl(story.mediaStoragePath);
          return [story.id, signedUrl] as const;
        }));

        if (!cancelled) {
          setContext(viewerContext);
          setUrlsByStoryId(Object.fromEntries(pairs));
        }
      } catch {
        if (!cancelled) setError('fetch_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const currentStory = context?.stories[activeIndex] ?? null;
  const currentStorySignedUrl = currentStory ? urlsByStoryId[currentStory.id] : null;
  const storyDurationMs = useMemo(() => {
    if (!currentStory) return IMAGE_DURATION_MS;
    if (currentStory.mediaType === 'video') {
      return currentStory.durationMs && currentStory.durationMs > 0 ? currentStory.durationMs : VIDEO_FALLBACK_DURATION_MS;
    }
    return IMAGE_DURATION_MS;
  }, [currentStory]);

  const currentStoryCanStart = useMemo(() => {
    if (!currentStory) return false;
    if (!currentStorySignedUrl) return true;
    if (mediaFailedIds[currentStory.id]) return true;
    if (currentStory.mediaType === 'image') return true;
    return !!readyVideoStoryIds[currentStory.id];
  }, [currentStory, currentStorySignedUrl, mediaFailedIds, readyVideoStoryIds]);

  useEffect(() => {
    if (!context?.stories.length) return;
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    if (!currentStoryCanStart) return;

    const animation = Animated.timing(progressAnim, {
      toValue: 1,
      duration: storyDurationMs,
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) goNext();
    });

    return () => {
      animation.stop();
    };
  }, [activeIndex, context?.stories.length, currentStoryCanStart, goNext, progressAnim, storyDurationMs]);

  const renderUnavailableState = () => {
    if (isViewingOwnStories) {
      return (
        <View style={styles.centerState}>
          <AppText weight="bold" style={styles.stateTitle}>لا توجد قصص نشطة</AppText>
          <AppText muted style={styles.stateDescription}>أضف قصة جديدة أو راجع قصصك من شاشة الإدارة.</AppText>
          <View style={styles.stateActions}>
            <AppButton label="إضافة قصة" onPress={() => router.push('/story/create')} />
            <AppButton label="إدارة قصصي" variant="neutral" onPress={() => router.push('/story/manage')} />
            <AppButton label="الرجوع" variant="neutral" onPress={closeViewer} />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.centerState}>
        <AppText weight="bold" style={styles.stateTitle}>القصة غير متاحة</AppText>
        <AppText muted style={styles.stateDescription}>قد تكون انتهت أو تعذر تحميلها.</AppText>
        <AppButton label="الرجوع" onPress={closeViewer} />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerState}><AppText style={styles.loadingText}>جارٍ تحميل القصة...</AppText></View>
      </View>
    );
  }

  if (error || !context || !context.stories.length) {
    return <View style={styles.container}>{renderUnavailableState()}</View>;
  }

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={(event) => setActiveIndex(event.nativeEvent.position)}
      >
        {context.stories.map((story: StoryRecord, index) => {
          const signedUrl = urlsByStoryId[story.id];
          const failed = mediaFailedIds[story.id] || !signedUrl;

          return (
            <View key={story.id} style={styles.page}>
              {failed ? (
                <View style={styles.mediaFallback}><AppText style={styles.mediaFallbackText}>تعذر تحميل هذه القصة.</AppText></View>
              ) : story.mediaType === 'image' ? (
                <ExpoImage
                  source={{ uri: signedUrl }}
                  style={styles.media}
                  contentFit="contain"
                  onError={() => setMediaFailedIds((prev) => ({ ...prev, [story.id]: true }))}
                />
              ) : (
                <StoryVideo
                  uri={signedUrl}
                  active={index === activeIndex}
                  onError={() => setMediaFailedIds((prev) => ({ ...prev, [story.id]: true }))}
                  onReady={() => setReadyVideoStoryIds((prev) => (
                    prev[story.id] ? prev : { ...prev, [story.id]: true }
                  ))}
                />
              )}
            </View>
          );
        })}
      </PagerView>

      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.progressRow}>
          {context.stories.map((story, index) => {
            const width = index === activeIndex
              ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
              : index < activeIndex ? '100%' : '0%';

            return (
              <View key={story.id} style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width }]} />
              </View>
            );
          })}
        </View>

        <View style={styles.headerRow}>
          <View style={styles.authorRow}>
            <View style={styles.authorAvatar}>
              {context.author.avatarUrl ? (
                <ExpoImage source={{ uri: context.author.avatarUrl }} style={styles.authorAvatarImage} contentFit="cover" />
              ) : (
                <AppText style={styles.authorFallback} weight="bold">{(context.author.displayName ?? context.author.username ?? 'م').charAt(0)}</AppText>
              )}
            </View>
            <View>
              <AppText style={styles.authorName}>{context.author.displayName ?? context.author.username ?? 'مستخدم'}</AppText>
              {context.author.username ? <AppText style={styles.authorUsername}>@{context.author.username}</AppText> : null}
            </View>
          </View>
          <View style={styles.headerActions}>
            {isViewingOwnStories ? (
              <Pressable onPress={() => router.push('/story/manage')}>
                <AppText style={styles.manageText}>إدارة</AppText>
              </Pressable>
            ) : null}
            <Pressable onPress={closeViewer}><AppText style={styles.closeText}>إغلاق</AppText></Pressable>
          </View>
        </View>
      </View>

      <View style={styles.navLayer} pointerEvents="box-none">
        <Pressable style={styles.leftZone} onPress={goPrevious} />
        <Pressable style={styles.rightZone} onPress={goNext} />
      </View>

      {currentStory?.caption ? (
        <View style={styles.captionBox}><AppText style={styles.captionText}>{currentStory.caption}</AppText></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  pager: { flex: 1 },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  progressRow: { flexDirection: 'row', gap: 6 },
  progressTrack: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorAvatar: { width: 36, height: 36, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  authorAvatarImage: { width: '100%', height: '100%' },
  authorFallback: { color: '#fff' },
  authorName: { color: '#fff' },
  authorUsername: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  closeText: { color: '#fff', fontSize: 14 },
  manageText: { color: '#fff', fontSize: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  navLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 112,
    bottom: 110,
    zIndex: 1,
  },
  leftZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 88,
  },
  rightZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 88,
  },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 56, paddingHorizontal: 12, gap: 12, zIndex: 3 },
  captionBox: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingVertical: 24, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 3 },
  captionText: { color: '#fff', textAlign: 'right' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  stateTitle: { color: '#fff', fontSize: 20 },
  stateDescription: { textAlign: 'center' },
  loadingText: { color: '#fff' },
  mediaFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mediaFallbackText: { color: '#fff' },
  stateActions: { width: '100%', gap: 10 },
});
