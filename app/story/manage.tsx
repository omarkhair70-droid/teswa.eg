import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { createStoryMediaSignedUrl, deleteStoryFromMobile, fetchActiveStoriesByUserId, StoryRecord } from '@/lib/stories';

function formatRemainingTime(expiresAt: string): string {
  const expiresAtDate = new Date(expiresAt);
  if (Number.isNaN(expiresAtDate.getTime())) return 'ينتهي قريباً';

  const diffMs = expiresAtDate.getTime() - Date.now();
  if (diffMs <= 0) return 'تنتهي قريباً';

  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) return `تنتهي خلال ${diffMinutes} دقيقة`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `تنتهي خلال ${diffHours} ساعة`;

  const diffDays = Math.floor(diffHours / 24);
  return `تنتهي خلال ${diffDays} يوم`;
}

export default function StoryManageScreen() {
  const { user } = useAuth();
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [imageSignedUrls, setImageSignedUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingStoryIds, setDeletingStoryIds] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setStories([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setFeedback(null);

    try {
      const activeStories = await fetchActiveStoriesByUserId(user.id);
      setStories(activeStories);

      const imageStories = activeStories.filter((story) => story.mediaType === 'image');
      const signedUrlEntries = await Promise.all(
        imageStories.map(async (story) => {
          const signedUrl = await createStoryMediaSignedUrl(story.mediaStoragePath);
          return [story.id, signedUrl] as const;
        }),
      );

      setImageSignedUrls(Object.fromEntries(signedUrlEntries));
    } catch (loadError) {
      if (__DEV__) console.log('[story-manage] load failed', loadError);
      setError('تعذر تحميل القصص النشطة حالياً. حاول مرة أخرى.');
      setStories([]);
      setImageSignedUrls({});
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadStories();
    }, [loadStories]),
  );

  const countLabel = useMemo(() => `${stories.length} قصة تظهر الآن`, [stories.length]);

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

            setDeletingStoryIds((current) => {
              const next = { ...current };
              delete next[story.id];
              return next;
            });

            if (!result.ok) {
              setFeedback(result.message);
              return;
            }

            setStories((current) => current.filter((item) => item.id !== story.id));
            setImageSignedUrls((current) => {
              const next = { ...current };
              delete next[story.id];
              return next;
            });

            if (result.storageCleanupFailed) {
              setFeedback('تم حذف القصة.');
              return;
            }

            setFeedback('تم حذف القصة بنجاح.');
          })();
        },
      },
    ]);
  }, [user?.id]);

  if (!user) {
    return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإدارة قصصك النشطة." /></AppScreen>;
  }

  if (loading) {
    return <AppScreen><AppText muted>جاري تحميل القصص النشطة...</AppText></AppScreen>;
  }

  if (error) {
    return (
      <AppScreen>
        <AppCard>
          <View style={styles.group}>
            <AppText>{error}</AppText>
            <AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadStories()} />
          </View>
        </AppCard>
      </AppScreen>
    );
  }

  if (!stories.length) {
    return (
      <AppScreen>
        <View style={styles.content}>
          <EmptyState title="لا توجد قصص نشطة" description="أضف قصة جديدة وستظهر هنا حتى تنتهي." />
          <AppButton label="إضافة قصة" onPress={() => router.push('/story/create')} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppCard>
          <View style={styles.group}>
            <AppText weight="bold" style={styles.title}>قصصي النشطة</AppText>
            <AppText muted>{countLabel}</AppText>
            <AppButton label="عرض قصصي" variant="neutral" onPress={() => router.push(`/story/${user.id}`)} />
            <AppButton label="إضافة قصة" variant="neutral" onPress={() => router.push('/story/create')} />
          </View>
        </AppCard>

        {feedback ? <AppCard><AppText muted>{feedback}</AppText></AppCard> : null}

        {stories.map((story) => {
          const imagePreviewUrl = story.mediaType === 'image' ? imageSignedUrls[story.id] : null;
          const createdAtLabel = new Date(story.createdAt);
          const createdLabel = Number.isNaN(createdAtLabel.getTime())
            ? 'غير متاح'
            : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(createdAtLabel);
          const expiresAtLabel = new Date(story.expiresAt);
          const expiresLabel = Number.isNaN(expiresAtLabel.getTime())
            ? 'غير متاح'
            : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(expiresAtLabel);

          return (
            <AppCard key={story.id}>
              <View style={styles.group}>
                <AppText weight="semibold">{story.mediaType === 'image' ? 'صورة' : 'فيديو'}</AppText>

                {story.mediaType === 'image' ? (
                  imagePreviewUrl ? (
                    <ExpoImage source={{ uri: imagePreviewUrl }} style={styles.previewImage} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                  ) : (
                    <View style={styles.placeholder}><AppText muted>تعذر تحميل معاينة الصورة</AppText></View>
                  )
                ) : (
                  <View style={styles.placeholder}><AppText weight="semibold">فيديو نشط</AppText></View>
                )}

                {story.caption ? <AppText>{story.caption}</AppText> : null}
                <AppText muted>أضيفت: {createdLabel}</AppText>
                <AppText muted>تنتهي: {expiresLabel}</AppText>
                <AppText muted>{formatRemainingTime(story.expiresAt)}</AppText>
                <AppButton
                  label={deletingStoryIds[story.id] ? 'جارٍ الحذف...' : 'حذف القصة'}
                  variant="neutral"
                  onPress={() => handleDeleteStory(story)}
                  disabled={Boolean(deletingStoryIds[story.id])}
                />
              </View>
            </AppCard>
          );
        })}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  title: { fontSize: 22 },
  previewImage: { width: '100%', height: 240, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  placeholder: {
    width: '100%',
    minHeight: 140,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
});
