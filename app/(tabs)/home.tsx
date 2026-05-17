import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppButton } from '@/components/ui/AppButton';
import { ItemCard } from '@/components/marketplace/ItemCard';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { fetchMarketplaceItems, MarketplaceItem } from '@/lib/marketplace-items';
import { ActiveStorySummary, fetchActiveStoriesForHome } from '@/lib/stories';
import { useAuth } from '@/lib/auth';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stories, setStories] = useState<ActiveStorySummary[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMarketplaceItems();
      setItems(result);
    } catch {
      setError('تعذر تحميل العناصر حالياً. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    setStoriesError(null);
    try {
      const result = await fetchActiveStoriesForHome();
      setStories(result);
    } catch {
      setStoriesError('تعذر تحميل القصص حالياً.');
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
    loadStories();
  }, [loadItems, loadStories]);

  useFocusEffect(
    useCallback(() => {
      void loadStories();
    }, [loadStories]),
  );

  const myStorySummary = useMemo(() => stories.find((summary) => summary.author.id === user?.id) ?? null, [stories, user?.id]);
  const otherStorySummaries = useMemo(() => stories.filter((summary) => summary.author.id !== user?.id), [stories, user?.id]);
  const totalActiveStories = stories.reduce((total, summary) => total + summary.stories.length, 0);

  return (
    <AppScreen style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText weight="bold" style={styles.title}>أهلاً بك في تِسوى</AppText>
            <AppText muted>استكشف أحدث العناصر الجاهزة للتبديل اليوم.</AppText>

            <View style={styles.storiesSection}>
              <View style={styles.storiesHeaderRow}>
                <AppText weight="bold">القصص</AppText>
                {!storiesLoading && !storiesError && totalActiveStories > 0 ? (
                  <AppText muted style={styles.storyCount}>{totalActiveStories} قصة</AppText>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storiesRail}
              >
                {myStorySummary && user?.id ? (
                  <Pressable style={styles.storyTile} onPress={() => router.push(`/story/${user.id}`)}>
                    <View style={[styles.storyAvatar, styles.myStoryActiveAvatar]}>
                      {myStorySummary.author.avatarUrl ? (
                        <ExpoImage source={{ uri: myStorySummary.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                      ) : (
                        <AppText weight="bold" style={styles.fallbackInitial}>
                          {(myStorySummary.author.displayName ?? myStorySummary.author.username ?? 'م').trim().charAt(0).toUpperCase()}
                        </AppText>
                      )}
                    </View>
                    <AppText numberOfLines={1} style={styles.storyLabel}>قصتك</AppText>
                    {myStorySummary.stories.length > 1 ? <AppText muted style={styles.myStoryCount}>{myStorySummary.stories.length}</AppText> : null}
                  </Pressable>
                ) : (
                  <Pressable style={styles.storyTile} onPress={() => router.push('/story/create')}>
                    <View style={[styles.storyAvatar, styles.addStoryAvatar]}>
                      <AppText weight="bold" style={styles.addStoryPlus}>+</AppText>
                    </View>
                    <AppText numberOfLines={1} style={styles.storyLabel}>قصتك</AppText>
                  </Pressable>
                )}

                {otherStorySummaries.map((story) => {
                  const label = story.author.displayName ?? (story.author.username ? `@${story.author.username}` : 'مستخدم');
                  const fallbackInitial = (story.author.displayName ?? story.author.username ?? 'م').trim().charAt(0).toUpperCase();

                  return (
                    <Pressable key={story.author.id} style={styles.storyTile} onPress={() => router.push(`/story/${story.author.id}`)}>
                      <View style={styles.storyAvatar}>
                        {story.author.avatarUrl ? (
                          <ExpoImage source={{ uri: story.author.avatarUrl }} style={styles.avatarImage} contentFit="cover" />
                        ) : (
                          <AppText weight="bold" style={styles.fallbackInitial}>{fallbackInitial}</AppText>
                        )}
                      </View>
                      <AppText numberOfLines={1} style={styles.storyLabel}>{label}</AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {storiesLoading ? <AppText muted>جارٍ تحميل القصص...</AppText> : null}
              {!storiesLoading && storiesError ? (
                <View style={styles.inlineStateRow}>
                  <AppText muted>{storiesError}</AppText>
                  <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadStories} />
                </View>
              ) : null}
              {!storiesLoading && !storiesError && stories.length === 0 ? (
                <AppText muted>لا توجد قصص نشطة بعد.</AppText>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => <ItemCard item={item} />}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري التحميل" description="نقوم بجلب العناصر المتاحة الآن." />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState title="حدث خطأ" description={error} />
              <AppButton label="إعادة المحاولة" onPress={loadItems} />
            </View>
          ) : (
            <EmptyState title="لا توجد عناصر حالياً" description="أضفنا الأساس، وستظهر العناصر هنا فور توفرها." />
          )
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: 24 },
  storiesSection: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  storiesHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storyCount: { fontSize: 12 },
  storiesRail: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  storyTile: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  storyAvatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  addStoryAvatar: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  myStoryActiveAvatar: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  addStoryPlus: {
    fontSize: 28,
    color: colors.primary,
    lineHeight: 30,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  fallbackInitial: {
    color: colors.textMuted,
    fontSize: 20,
  },
  storyLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  myStoryCount: {
    fontSize: 10,
    marginTop: -4,
  },
  inlineStateRow: {
    gap: spacing.sm,
  },
  stateBox: { gap: spacing.md },
});
