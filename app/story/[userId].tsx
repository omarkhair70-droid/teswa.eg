import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import PagerView from 'react-native-pager-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEventListener } from 'expo';
import { Image as ExpoImage } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/lib/auth';
import { StoryRecord, StoryViewerContext, createStoryMediaSignedUrlCached, fetchStoryViewerContextByUserId } from '@/lib/stories';
import { markStoryViewedFromMobile } from '@/lib/story-views';
import { fetchStoryLikeStateForViewer, setStoryLikedFromMobile } from '@/lib/story-likes';
import { sendStoryReplyFromMobile, sendStoryVoiceReplyFromMobile } from '@/lib/contextual-conversations';
import { blockUserFromMobile, fetchUserBlockState, unblockUserFromMobile } from '@/lib/user-blocks';
import { buildCachedVideoSource, getMediaNeighborIndexes, prefetchImagesMemoryDisk } from '@/lib/media/media-performance';

const IMAGE_DURATION_MS = 5000;
const VIDEO_FALLBACK_DURATION_MS = 8000;

const MAX_STORY_VOICE_MS = 45_000;
const formatMs = (durationMs: number) => `${String(Math.floor(Math.max(0, Math.floor(durationMs / 1000)) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.floor(durationMs / 1000)) % 60).padStart(2, '0')}`;


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
  const source = buildCachedVideoSource(uri);
  const player = useVideoPlayer(source, (instance) => {
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

function formatStoryAgeLabel(createdAt: string): string {
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return 'منذ وقت قصير';

  const diffMs = Math.max(0, Date.now() - createdAtMs);
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'الآن';
  if (diffMinutes < 60) return diffMinutes === 1 ? 'منذ دقيقة' : `منذ ${diffMinutes} دقيقة`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return diffHours === 1 ? 'منذ ساعة' : `منذ ${diffHours} ساعة`;

  return 'اليوم';
}

export default function StoryViewerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const normalizedUserId = userId?.trim() ?? '';
  const isViewingOwnStories = !!user?.id && normalizedUserId === user.id;
  const pagerRef = useRef<PagerView>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const markedViewedStoryIdsRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<StoryViewerContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlsByStoryId, setUrlsByStoryId] = useState<Record<string, string | null>>({});
  const [mediaFailedIds, setMediaFailedIds] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [readyVideoStoryIds, setReadyVideoStoryIds] = useState<Record<string, boolean>>({});
  const [likedStoryIds, setLikedStoryIds] = useState<Record<string, boolean>>({});
  const [likeBusyStoryIds, setLikeBusyStoryIds] = useState<Record<string, boolean>>({});
  const [likeActionError, setLikeActionError] = useState<string | null>(null);
  const [storyReplyBody, setStoryReplyBody] = useState('');
  const [storyReplySending, setStoryReplySending] = useState(false);
  const [storyReplyFeedback, setStoryReplyFeedback] = useState<string | null>(null);
  const [storyReplyError, setStoryReplyError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<{ uri: string; durationMs: number; mimeType: string } | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 250);
  const voicePlayer = useAudioPlayer(voiceDraft?.uri ?? null, { updateInterval: 250 });
  const voicePlayerStatus = useAudioPlayerStatus(voicePlayer);


  const voiceReplyInteractionActive =
    voiceOpen ||
    recorderState.isRecording ||
    !!voiceDraft ||
    voiceSending ||
    voiceBusy;

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
          const signedUrl = await createStoryMediaSignedUrlCached(story.mediaStoragePath);
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

  useEffect(() => {
    if (!context?.author.avatarUrl) return;
    void prefetchImagesMemoryDisk([context.author.avatarUrl]);
  }, [context?.author.avatarUrl]);

  useEffect(() => {
    if (!context?.stories.length) return;
    const neighborIndexes = getMediaNeighborIndexes(activeIndex, context.stories.length, { previous: 1, next: 2 });
    const candidateIndexes = [activeIndex, ...neighborIndexes];
    const imageUrls = candidateIndexes
      .map((index) => context.stories[index])
      .filter((story): story is StoryRecord => Boolean(story) && story.mediaType === 'image')
      .map((story) => urlsByStoryId[story.id]);
    void prefetchImagesMemoryDisk(imageUrls);
  }, [activeIndex, context?.stories, urlsByStoryId]);

  const currentStory = context?.stories[activeIndex] ?? null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !context?.author.id || isViewingOwnStories) return;
      const s = await fetchUserBlockState(user.id, context.author.id);
      if (!cancelled && s.ok) setBlockedByMe(s.state.blockedByMe);
    })();
    return () => { cancelled = true; };
  }, [context?.author.id, isViewingOwnStories, user?.id]);
  const currentStoryAgeLabel = currentStory ? formatStoryAgeLabel(currentStory.createdAt) : null;
  const currentStorySignedUrl = currentStory ? urlsByStoryId[currentStory.id] : null;
  const currentStoryLiked = currentStory ? Boolean(likedStoryIds[currentStory.id]) : false;
  const currentStoryLikeBusy = currentStory ? Boolean(likeBusyStoryIds[currentStory.id]) : false;
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
    if (!user?.id) return;
    if (!currentStory) return;
    if (!currentStorySignedUrl) return;
    if (isViewingOwnStories) return;

    const storyId = currentStory.id.trim();
    if (!storyId) return;
    if (markedViewedStoryIdsRef.current.has(storyId)) return;

    markedViewedStoryIdsRef.current.add(storyId);
    void markStoryViewedFromMobile({ storyId, viewerId: user.id });
  }, [currentStory, currentStorySignedUrl, isViewingOwnStories, user?.id]);


  useEffect(() => {
    if (!user?.id || !context?.stories.length || isViewingOwnStories) {
      setLikedStoryIds({});
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const likedState = await fetchStoryLikeStateForViewer({
          viewerId: user.id,
          storyIds: context.stories.map((story) => story.id),
        });
        if (!cancelled) setLikedStoryIds(likedState);
      } catch (likeStateError) {
        if (__DEV__) console.warn('[story-viewer] like state failed', likeStateError);
        if (!cancelled) setLikedStoryIds({});
      }
    })();

    return () => { cancelled = true; };
  }, [context?.stories, isViewingOwnStories, user?.id]);

  useEffect(() => {
    setLikeActionError(null);
  }, [activeIndex, currentStory?.id]);

  useEffect(() => {
    if (!context?.stories.length) return;
    progressAnim.stopAnimation();
    progressAnim.setValue(0);
    if (!currentStoryCanStart) return;
    if (voiceReplyInteractionActive) return;

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
  }, [activeIndex, context?.stories.length, currentStoryCanStart, goNext, progressAnim, storyDurationMs, voiceReplyInteractionActive]);


  const handleToggleStoryLike = useCallback(async () => {
    if (!user?.id) return;
    if (!currentStory) return;
    if (isViewingOwnStories) return;

    const storyId = currentStory.id.trim();
    if (!storyId || likeBusyStoryIds[storyId]) return;

    setLikeActionError(null);
    setLikeBusyStoryIds((prev) => ({ ...prev, [storyId]: true }));

    try {
      const result = await setStoryLikedFromMobile({
        storyId,
        likerId: user.id,
        liked: !currentStoryLiked,
      });

      if (!result.ok) {
        setLikeActionError(result.message);
        return;
      }

      setLikeActionError(null);
      setLikedStoryIds((prev) => {
        if (result.liked) return { ...prev, [storyId]: true };
        const next = { ...prev };
        delete next[storyId];
        return next;
      });
    } finally {
      setLikeBusyStoryIds((prev) => {
        const next = { ...prev };
        delete next[storyId];
        return next;
      });
    }
  }, [currentStory, currentStoryLiked, isViewingOwnStories, likeBusyStoryIds, user?.id]);


  const replyComposerVisible = !!user?.id && !!currentStory && !isViewingOwnStories;

  const handleSendStoryReply = useCallback(async () => {
    if (!replyComposerVisible || !user?.id || !currentStory) return;
    setStoryReplyError(null);
    setStoryReplyFeedback(null);
    setStoryReplySending(true);
    try {
      const result = await sendStoryReplyFromMobile({ storyId: currentStory.id, currentUserId: user.id, body: storyReplyBody });
      if (!result.ok) {
        setStoryReplyError(result.message);
        return;
      }
      setStoryReplyBody('');
      setStoryReplyFeedback('تم إرسال ردك.');
    } finally {
      setStoryReplySending(false);
    }
  }, [currentStory, replyComposerVisible, storyReplyBody, user?.id]);

  useEffect(() => {
    setStoryReplyError(null);
    setStoryReplyFeedback(null);
  }, [currentStory?.id]);

  
  const handleStartVoiceReply = useCallback(async () => {
    if (!user?.id || !currentStory) return;
    setStoryReplyError(null); setStoryReplyFeedback(null); setVoiceBusy(true);
    try {
      voicePlayer.pause();
      try {
        await voicePlayer.seekTo(0);
      } catch {}
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setStoryReplyError('لا يمكن تسجيل الصوت بدون إذن الميكروفون.'); return; }
      setVoiceDraft(null);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setVoiceOpen(true);
    } catch {
      setVoiceOpen(false);
      setVoiceDraft(null);
      setStoryReplyError('تعذر بدء الرد الصوتي. حاول مرة أخرى.');
    } finally { setVoiceBusy(false); }
  }, [audioRecorder, currentStory, user?.id, voicePlayer]);

  const autoStopHandledRef = useRef(false);

  const stopVoice = useCallback(async () => {
    setVoiceBusy(true);
    try {
      const preStopDuration = recorderState.durationMillis ?? 0;
      await audioRecorder.stop();
      let rawDurationMs = preStopDuration;
      if (!rawDurationMs) {
        const status = await audioRecorder.getStatus();
        rawDurationMs = status.durationMillis ?? 0;
      }
      const safeDurationMs = Math.min(rawDurationMs, MAX_STORY_VOICE_MS);
      const uri = audioRecorder.uri;
      if (!uri) {
        setVoiceOpen(false);
        setVoiceDraft(null);
        setStoryReplyError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.');
        return;
      }
      setVoiceDraft({ uri, durationMs: safeDurationMs, mimeType: 'audio/m4a' });
    } catch {
      setStoryReplyError('تعذر حفظ التسجيل الصوتي. حاول مرة أخرى.');
    } finally { setVoiceBusy(false); }
  }, [audioRecorder, recorderState.durationMillis]);

  useEffect(() => {
    if (!recorderState.isRecording) { autoStopHandledRef.current = false; return; }
    if (recorderState.durationMillis >= MAX_STORY_VOICE_MS && !autoStopHandledRef.current) {
      autoStopHandledRef.current = true;
      void stopVoice();
    }
  }, [recorderState.isRecording, recorderState.durationMillis, stopVoice]);

  const sendVoiceReply = useCallback(async () => {
    if (!voiceDraft || !user?.id || !currentStory) return;
    setVoiceSending(true); setStoryReplyError(null);
    try {
      const r = await sendStoryVoiceReplyFromMobile({ storyId: currentStory.id, currentUserId: user.id, localUri: voiceDraft.uri, durationMs: Math.min(voiceDraft.durationMs, MAX_STORY_VOICE_MS), mimeType: voiceDraft.mimeType });
      if (!r.ok) { setStoryReplyError(r.message); return; }
      setVoiceDraft(null); setVoiceOpen(false); setStoryReplyFeedback('تم إرسال الرد الصوتي.');
    } catch {
      setStoryReplyError('تعذر إرسال الرد الصوتي الآن. حاول مرة أخرى.');
    } finally { setVoiceSending(false); }
  }, [voiceDraft, user?.id, currentStory]);


  const cancelVoiceComposer = useCallback(async () => {
    try {
      if (recorderState.isRecording) {
        await audioRecorder.stop();
      }
    } catch {
      setStoryReplyError('تعذر إلغاء التسجيل الصوتي. حاول مرة أخرى.');
    } finally {
      setVoiceOpen(false);
      setVoiceDraft(null);
      voicePlayer.pause();
      try {
        await voicePlayer.seekTo(0);
      } catch {}
    }
  }, [audioRecorder, recorderState.isRecording, voicePlayer]);

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
        scrollEnabled={!voiceReplyInteractionActive}
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
                  cachePolicy="memory-disk"
                  transition={120}
                  onError={() => setMediaFailedIds((prev) => ({ ...prev, [story.id]: true }))}
                />
              ) : (
                <>
                  <StoryVideo
                    uri={signedUrl}
                    active={index === activeIndex}
                    onError={() => setMediaFailedIds((prev) => ({ ...prev, [story.id]: true }))}
                    onReady={() => setReadyVideoStoryIds((prev) => (
                      prev[story.id] ? prev : { ...prev, [story.id]: true }
                    ))}
                  />
                  {index === activeIndex && !mediaFailedIds[story.id] && !readyVideoStoryIds[story.id] ? (
                    <View pointerEvents="none" style={styles.videoLoadingOverlay}>
                      <View style={styles.videoLoadingChip}>
                        <AppText style={styles.videoLoadingText}>نجهّز الفيديو...</AppText>
                      </View>
                    </View>
                  ) : null}
                </>
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
                <ExpoImage source={{ uri: context.author.avatarUrl }} style={styles.authorAvatarImage} contentFit="cover" cachePolicy="memory-disk" transition={100} />
              ) : (
                <AppText style={styles.authorFallback} weight="bold">{(context.author.displayName ?? context.author.username ?? 'م').charAt(0)}</AppText>
              )}
            </View>
            <View>
              <AppText style={styles.authorName}>{context.author.displayName ?? context.author.username ?? 'مستخدم'}</AppText>
              {currentStoryAgeLabel ? (
                <AppText style={styles.authorUsername}>
                  {context.author.username ? `@${context.author.username} • ${currentStoryAgeLabel}` : currentStoryAgeLabel}
                </AppText>
              ) : null}
            </View>
          </View>
          <View style={styles.headerActions}>
            {!isViewingOwnStories ? (
              <Pressable onPress={() => void handleToggleStoryLike()} disabled={currentStoryLikeBusy} style={currentStoryLikeBusy ? styles.likeDisabled : undefined}>
                <AppText style={[styles.likeText, currentStoryLiked && styles.likeTextActive]}>{currentStoryLiked ? '♥' : '♡'}</AppText>
              </Pressable>
            ) : null}
            {isViewingOwnStories ? (
              <Pressable onPress={() => router.push('/story/manage')}>
                <AppText style={styles.manageText}>إدارة</AppText>
              </Pressable>
            ) : null}
            <View style={styles.safetyRow}>
              {!isViewingOwnStories && currentStory ? <Pressable onPress={() => router.push(`/report/story/${currentStory.id}`)}><AppText style={styles.closeText}>الإبلاغ عن القصة</AppText></Pressable> : null}
              {!isViewingOwnStories ? <Pressable disabled={safetyBusy} onPress={async () => { if (!user?.id || !context?.author.id || safetyBusy) return; setSafetyBusy(true); const r = blockedByMe ? await unblockUserFromMobile(user.id, context.author.id) : await blockUserFromMobile(user.id, context.author.id); if (r.ok) { const s = await fetchUserBlockState(user.id, context.author.id); if (s.ok) setBlockedByMe(s.state.blockedByMe); } setSafetyBusy(false); }}><AppText style={styles.closeText}>{safetyBusy ? '...' : (blockedByMe ? 'إلغاء الحظر' : 'حظر المستخدم')}</AppText></Pressable> : null}
              <Pressable onPress={closeViewer}><AppText style={styles.closeText}>إغلاق</AppText></Pressable>
            </View>
          </View>
        </View>
      </View>

      {likeActionError ? (
        <View style={styles.likeErrorBox}>
          <AppText style={styles.likeErrorText}>{likeActionError}</AppText>
        </View>
      ) : null}

      <View style={styles.navLayer} pointerEvents={voiceReplyInteractionActive ? 'none' : 'box-none'}>
        <Pressable style={styles.leftZone} onPress={goPrevious} />
        <Pressable style={styles.rightZone} onPress={goNext} />
      </View>


      {replyComposerVisible ? (
        <View style={styles.replyComposerOverlay}>
          {storyReplyError ? <AppText style={styles.replyErrorText}>{storyReplyError}</AppText> : null}
          {!storyReplyError && storyReplyFeedback ? <AppText style={styles.replyFeedbackText}>{storyReplyFeedback}</AppText> : null}
          <View style={styles.replyComposerRow}>
            <Pressable style={[styles.replySendButton, (storyReplySending || !storyReplyBody.trim()) && styles.replySendButtonDisabled]} onPress={() => void handleSendStoryReply()} disabled={storyReplySending || !storyReplyBody.trim()}>
              <AppText style={styles.replySendButtonText}>{storyReplySending ? '...' : 'إرسال'}</AppText>
            </Pressable>
            <TextInput value={storyReplyBody} onChangeText={setStoryReplyBody} placeholder="رد على القصة..." placeholderTextColor="rgba(255,255,255,0.6)" style={styles.replyInput} editable={!storyReplySending} textAlign="right" />
          </View>
          <Pressable onPress={() => void handleStartVoiceReply()} disabled={voiceBusy || recorderState.isRecording || voiceSending} style={styles.replyVoiceButton}><AppText style={styles.replySendButtonText}>رد بصوتك</AppText></Pressable>
          {voiceOpen ? (<View style={styles.voiceBox}>
            {recorderState.isRecording ? (<View style={styles.replyComposerRow}><AppText style={styles.replyFeedbackText}>جاري التسجيل {formatMs(recorderState.durationMillis)}</AppText><Pressable onPress={() => void stopVoice()}><AppText style={styles.replySendButtonText}>إيقاف</AppText></Pressable><Pressable onPress={() => void cancelVoiceComposer()}><AppText style={styles.replySendButtonText}>إلغاء</AppText></Pressable></View>) : null}
            {!recorderState.isRecording && voiceDraft ? (<View style={styles.replyComposerRow}><Pressable onPress={async () => { if (voicePlayerStatus.playing) { voicePlayer.pause(); return; } await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }); voicePlayer.play(); }}><AppText style={styles.replySendButtonText}>{voicePlayerStatus.playing ? 'إيقاف المعاينة' : 'تشغيل المعاينة'}</AppText></Pressable><Pressable onPress={() => void sendVoiceReply()} disabled={voiceSending}><AppText style={styles.replySendButtonText}>{voiceSending ? '...' : 'إرسال الرد الصوتي'}</AppText></Pressable><Pressable onPress={() => { setVoiceDraft(null); void handleStartVoiceReply(); }}><AppText style={styles.replySendButtonText}>إعادة التسجيل</AppText></Pressable></View>) : null}
          </View>) : null}

        </View>
      ) : null}

      {currentStory?.caption ? (
        <View style={[styles.captionBox, replyComposerVisible && styles.captionBoxWithReplyComposer]}><AppText style={styles.captionText}>{currentStory.caption}</AppText></View>
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
  likeText: { color: '#fff', fontSize: 18, lineHeight: 20 },
  likeTextActive: { color: '#fff' },
  likeDisabled: { opacity: 0.6 },
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
  likeErrorBox: { position: 'absolute', top: 118, left: 12, right: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 3 },
  likeErrorText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, textAlign: 'right' },
  captionBox: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingVertical: 24, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 3 },
  captionBoxWithReplyComposer: { bottom: 76 },
  safetyRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'center' },
  replyComposerOverlay: { position: 'absolute', left: 12, right: 12, bottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 8, gap: 6, zIndex: 4 },
  replyComposerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyInput: { flex: 1, minHeight: 38, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' },
  replySendButton: { minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)' },
  replySendButtonDisabled: { opacity: 0.5 },
  replySendButtonText: { color: '#fff' },
  replyVoiceButton: { alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  voiceBox: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 8 },
  replyErrorText: { color: 'rgba(255,200,200,0.95)', fontSize: 12, textAlign: 'right' },
  replyFeedbackText: { color: 'rgba(230,255,230,0.95)', fontSize: 12, textAlign: 'right' },
  captionText: { color: '#fff', textAlign: 'right' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  stateTitle: { color: '#fff', fontSize: 20 },
  stateDescription: { textAlign: 'center' },
  loadingText: { color: '#fff' },
  mediaFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mediaFallbackText: { color: '#fff' },
  videoLoadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  videoLoadingChip: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  videoLoadingText: { color: '#fff', fontSize: 13 },
  stateActions: { width: '100%', gap: 10 },
});
