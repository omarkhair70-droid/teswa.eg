import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { createStoryMediaSignedUrl, deleteStoryFromMobile, fetchActiveStoriesByUserId, StoryRecord } from '@/lib/stories';
import { fetchStoryViewCountsForOwner } from '@/lib/story-views';
import { fetchStoryLikeCountsForOwner } from '@/lib/story-likes';

function formatRemainingTime(expiresAt: string): string {
  const expiresAtDate = new Date(expiresAt);
  if (Number.isNaN(expiresAtDate.getTime())) return 'تنتهي قريبًا';
  const diffMs = expiresAtDate.getTime() - Date.now();
  if (diffMs <= 0) return 'تنتهي قريبًا';
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `${diffMinutes} د`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} س`;
  return `${Math.floor(diffHours / 24)} ي`;
}

function formatStoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default function StoryManageScreen() {
  const { user } = useAuth();
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [imageSignedUrls, setImageSignedUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingStoryIds, setDeletingStoryIds] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [viewCountsByStoryId, setViewCountsByStoryId] = useState<Record<string, number>>({});
  const [viewCountsError, setViewCountsError] = useState<string | null>(null);
  const [likeCountsByStoryId, setLikeCountsByStoryId] = useState<Record<string, number>>({});
  const [likeCountsError, setLikeCountsError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setStories([]);
      setError(null);
      setViewCountsByStoryId({});
      setViewCountsError(null);
      setLikeCountsByStoryId({});
      setLikeCountsError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const activeStories = await fetchActiveStoriesByUserId(user.id);
      setStories(activeStories);
      const imageStories = activeStories.filter((story) => story.mediaType === 'image');
      const signedUrlEntries = await Promise.all(imageStories.map(async (story) => [story.id, await createStoryMediaSignedUrl(story.mediaStoragePath)] as const));
      setImageSignedUrls(Object.fromEntries(signedUrlEntries));

      try {
        const viewCounts = await fetchStoryViewCountsForOwner({ ownerId: user.id, storyIds: activeStories.map((story) => story.id) });
        setViewCountsByStoryId(viewCounts);
        setViewCountsError(null);
      } catch (countsError) {
        if (__DEV__) console.log('[story-manage] view counts failed', countsError);
        setViewCountsByStoryId({});
        setViewCountsError('تعذر تحميل عدد المشاهدات حالياً.');
      }

      try {
        const likeCounts = await fetchStoryLikeCountsForOwner({ ownerId: user.id, storyIds: activeStories.map((story) => story.id) });
        setLikeCountsByStoryId(likeCounts);
        setLikeCountsError(null);
      } catch (likeError) {
        if (__DEV__) console.log('[story-manage] like counts failed', likeError);
        setLikeCountsByStoryId({});
        setLikeCountsError('تعذر تحميل عدد الإعجابات حالياً.');
      }
    } catch (loadError) {
      if (__DEV__) console.log('[story-manage] load failed', loadError);
      setError('تعذر تحميل القصص النشطة حالياً. حاول مرة أخرى.');
      setStories([]);
      setImageSignedUrls({});
      setViewCountsByStoryId({});
      setViewCountsError(null);
      setLikeCountsByStoryId({});
      setLikeCountsError(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void loadStories(); }, [loadStories]));

  const totalViews = useMemo(() => stories.reduce((sum, story) => sum + (viewCountsByStoryId[story.id] ?? 0), 0), [stories, viewCountsByStoryId]);
  const totalLikes = useMemo(() => stories.reduce((sum, story) => sum + (likeCountsByStoryId[story.id] ?? 0), 0), [stories, likeCountsByStoryId]);

  const handleDeleteStory = useCallback((story: StoryRecord) => {
    if (!user?.id) return;
    Alert.alert('حذف القصة', 'هل أنت متأكد أنك تريد حذف هذه القصة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeletingStoryIds((current) => ({ ...current, [story.id]: true }));
            setFeedback(null);
            const result = await deleteStoryFromMobile({ userId: user.id, storyId: story.id });
            setDeletingStoryIds((current) => { const next = { ...current }; delete next[story.id]; return next; });
            if (!result.ok) {
              setFeedback(result.message);
              return;
            }
            setStories((current) => current.filter((item) => item.id !== story.id));
            setImageSignedUrls((current) => { const next = { ...current }; delete next[story.id]; return next; });
            setFeedback('تم حذف القصة.');
          })();
        },
      },
    ]);
  }, [user?.id]);

  if (!user) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإدارة قصصك النشطة." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="alive"><View style={styles.loadingStack}><View style={styles.loadingHero} />{[0, 1].map((key) => <View key={key} style={styles.loadingRow} />)}</View></AppScreen>;
  if (error) return <AppScreen backgroundVariant="soft"><View style={styles.stateStack}><EmptyState title="تعذر تحميل قصصك" description={error} /><AppButton label="إعادة المحاولة" onPress={() => void loadStories()} /><AppButton label="الرجوع للملف" variant="neutral" onPress={() => router.replace('/(tabs)/profile')} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.backButton}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.headerCopy}><AppText muted style={styles.eyebrow}>محتواك المؤقت</AppText><AppText weight="bold" style={styles.title}>إدارة القصص</AppText><AppText muted style={styles.subtitle}>تابع اللي ظاهر دلوقتي، المشاهدات، الإعجابات، ووقت انتهاء كل قصة.</AppText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="إضافة قصة" onPress={() => router.push('/story/create')} style={styles.addButton}><Ionicons name="add" size={21} color={colors.primary} /></Pressable>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{stories.length}</AppText><AppText muted style={styles.summaryLabel}>نشطة</AppText></View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{viewCountsError ? '—' : totalViews}</AppText><AppText muted style={styles.summaryLabel}>مشاهدة</AppText></View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{likeCountsError ? '—' : totalLikes}</AppText><AppText muted style={styles.summaryLabel}>إعجاب</AppText></View>
      </View>

      {feedback ? <View style={styles.feedbackStrip}><Ionicons name="checkmark-circle-outline" size={18} color={colors.success} /><AppText style={styles.feedbackText}>{feedback}</AppText></View> : null}
      {viewCountsError || likeCountsError ? <View style={styles.warningStrip}><Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /><AppText muted style={styles.warningText}>{[viewCountsError, likeCountsError].filter(Boolean).join(' ')}</AppText></View> : null}

      {!stories.length ? (
        <View style={styles.emptyPanel}><View style={styles.emptyIcon}><Ionicons name="play-circle-outline" size={29} color={colors.accent} /></View><AppText weight="bold" style={styles.emptyTitle}>مفيش قصص نشطة دلوقتي</AppText><AppText muted style={styles.emptyText}>شارك صورة أو فيديو سريع وخلي ملفك حي لمدة 24 ساعة.</AppText><AppButton label="إضافة قصة" onPress={() => router.push('/story/create')} /></View>
      ) : (
        <View style={styles.storyList}>
          {stories.map((story) => {
            const imagePreviewUrl = story.mediaType === 'image' ? imageSignedUrls[story.id] : null;
            const viewCount = viewCountsByStoryId[story.id] ?? 0;
            const likeCount = likeCountsByStoryId[story.id] ?? 0;
            const deleting = Boolean(deletingStoryIds[story.id]);
            return (
              <View key={story.id} style={styles.storyRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="فتح القصة" onPress={() => router.push(`/story/${user.id}`)} style={styles.storyMedia}>
                  {story.mediaType === 'image' && imagePreviewUrl ? <ExpoImage source={{ uri: imagePreviewUrl }} style={styles.previewImage} contentFit="cover" transition={120} cachePolicy="memory-disk" /> : <View style={styles.videoPlaceholder}><Ionicons name={story.mediaType === 'video' ? 'play' : 'image-outline'} size={23} color={colors.white} /></View>}
                  <View style={styles.mediaTypeBadge}><Ionicons name={story.mediaType === 'video' ? 'videocam-outline' : 'image-outline'} size={11} color={colors.white} /><AppText style={styles.mediaTypeText}>{story.mediaType === 'video' ? 'فيديو' : 'صورة'}</AppText></View>
                </Pressable>

                <View style={styles.storyCopy}>
                  <View style={styles.storyTopLine}><View style={styles.timePill}><Ionicons name="time-outline" size={12} color={colors.accent} /><AppText style={styles.timeText}>{formatRemainingTime(story.expiresAt)}</AppText></View><AppText muted style={styles.createdTime}>{formatStoryTime(story.createdAt)}</AppText></View>
                  <AppText weight="semibold" style={styles.storyCaption} numberOfLines={2}>{story.caption?.trim() || 'قصة بدون تعليق'}</AppText>
                  <View style={styles.metricsRow}><View style={styles.metric}><Ionicons name="eye-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.metricText}>{viewCountsError ? '—' : viewCount}</AppText></View><View style={styles.metric}><Ionicons name="heart-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.metricText}>{likeCountsError ? '—' : likeCount}</AppText></View></View>
                  <View style={styles.rowActions}>{viewCount > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="عرض مشاهدي القصة" onPress={() => router.push(`/story/viewers/${story.id}`)} style={styles.rowAction}><Ionicons name="people-outline" size={15} color={colors.primary} /><AppText style={styles.rowActionText}>المشاهدون</AppText></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="حذف القصة" disabled={deleting} onPress={() => handleDeleteStory(story)} style={[styles.deleteAction, deleting && styles.disabled]}><Ionicons name="trash-outline" size={15} color={colors.danger} /></Pressable></View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {stories.length ? <View style={styles.footerActions}><AppButton label="عرض قصصي" onPress={() => router.push(`/story/${user.id}`)} /><AppButton label="إضافة قصة جديدة" variant="neutral" onPress={() => router.push('/story/create')} /></View> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  addButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 27, lineHeight: 34, textAlign: 'right' },
  subtitle: { fontSize: 12, lineHeight: 19, textAlign: 'right' },
  summaryCard: { flexDirection: 'row-reverse', alignItems: 'stretch', paddingVertical: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  summaryValue: { fontSize: 21 },
  summaryLabel: { fontSize: 10 },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  feedbackStrip: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.successSoft },
  feedbackText: { flex: 1, color: colors.success, textAlign: 'right' },
  warningStrip: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background },
  warningText: { flex: 1, fontSize: 11, lineHeight: 18, textAlign: 'right' },
  emptyPanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 58, height: 58, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  storyList: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  storyRow: { minHeight: 142, flexDirection: 'row-reverse', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  storyMedia: { width: 100, height: 126, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#3A302A' },
  previewImage: { width: '100%', height: '100%' },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3A302A' },
  mediaTypeBadge: { position: 'absolute', top: 7, right: 7, flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4, borderRadius: radii.round, backgroundColor: 'rgba(28,25,23,0.68)' },
  mediaTypeText: { color: colors.white, fontSize: 8 },
  storyCopy: { flex: 1, alignItems: 'stretch', gap: spacing.sm },
  storyTopLine: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  timePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radii.round, backgroundColor: colors.accentSoft },
  timeText: { color: colors.accent, fontSize: 9 },
  createdTime: { fontSize: 9 },
  storyCaption: { fontSize: 13, lineHeight: 19, textAlign: 'right' },
  metricsRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  metric: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metricText: { fontSize: 10 },
  rowActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginTop: 'auto' },
  rowAction: { minHeight: 34, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  rowActionText: { color: colors.primary, fontSize: 10 },
  deleteAction: { width: 34, height: 34, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  footerActions: { gap: spacing.sm, marginBottom: spacing.xl },
  loadingStack: { gap: spacing.md },
  loadingHero: { height: 105, borderRadius: radii.xl, backgroundColor: '#EEE7DF' },
  loadingRow: { height: 150, borderRadius: radii.xl, backgroundColor: '#F3E7DB' },
  stateStack: { gap: spacing.sm },
  disabled: { opacity: 0.45 },
});
