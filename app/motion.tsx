import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { ActiveStorySummary, fetchActiveStoriesForHome } from '@/lib/stories';
import { fetchStoryDiscoveryItems, StoryDiscoveryItem } from '@/lib/story-discovery';

export default function MotionScreen() {
  const [stories, setStories] = useState<ActiveStorySummary[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [storiesError, setStoriesError] = useState<string | null>(null);

  const [items, setItems] = useState<StoryDiscoveryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    setStoriesError(null);
    try {
      const data = await fetchActiveStoriesForHome();
      setStories(data);
    } catch {
      setStoriesError('تعذر تحميل القصص حالياً.');
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    setItemsError(null);
    try {
      const data = await fetchStoryDiscoveryItems({ limit: 12 });
      setItems(data);
    } catch {
      setItemsError('تعذر تحميل العناصر ذات الحكاية حالياً.');
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStories();
    loadItems();
  }, [loadItems, loadStories]);

  const storyTiles = useMemo(() => stories.map((summary) => {
    const displayName = summary.author.displayName?.trim() || (summary.author.username ? `@${summary.author.username}` : 'مستخدم');
    const initial = displayName.charAt(0).toUpperCase();
    const count = summary.stories.length;

    return (
      <Pressable key={summary.author.id} style={styles.storyTile} onPress={() => router.push(`/story/${summary.author.id}`)}>
        {summary.author.avatarUrl ? (
          <ExpoImage source={{ uri: summary.author.avatarUrl }} style={styles.storyAvatar} contentFit="cover" />
        ) : (
          <View style={styles.storyAvatarFallback}><AppText weight="bold">{initial}</AppText></View>
        )}
        <AppText numberOfLines={1} style={styles.storyName}>{displayName}</AppText>
        {count > 1 ? <AppText muted style={styles.storyCount}>{count} قصص</AppText> : null}
      </Pressable>
    );
  }), [stories]);

  return (
    <AppScreen scrollable>
      <AppCard>
        <View style={styles.heroBox}>
          <AppText weight="bold" style={styles.heroTitle}>حركة تِسوى</AppText>
          <AppText>هنا تشوف القصص اللي شغالة، والحاجات اللي أصحابها حكوا عنها قبل ما تبدأ رحلتها الجديدة.</AppText>
          <AppText muted>مش مجرد عناصر معروضة. دي حاجات بدأت تاخد معنى.</AppText>
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.sectionHeader}>
          <AppText weight="bold">القصص النشطة</AppText>
          <AppText muted>لقطات قصيرة من الناس اللي بيعيشوا تِسوى دلوقتي.</AppText>
        </View>
        {storiesLoading ? <AppText>جارٍ تحميل القصص...</AppText> : null}
        {!storiesLoading && storiesError ? (
          <View style={styles.stateBox}>
            <AppText style={styles.errorText}>تعذر تحميل القصص حالياً.</AppText>
            <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadStories} />
          </View>
        ) : null}
        {!storiesLoading && !storiesError && stories.length === 0 ? (
          <View style={styles.stateBox}>
            <EmptyState title="لا توجد قصص نشطة الآن" description="ابدأ أول لقطة وخلّي تِسوى يتحرك." />
            <AppButton label="أضف قصة" onPress={() => router.push('/story/create')} />
          </View>
        ) : null}
        {!storiesLoading && !storiesError && stories.length > 0 ? <View style={styles.storyRail}>{storyTiles}</View> : null}
      </AppCard>

      <AppCard>
        <View style={styles.sectionHeader}>
          <AppText weight="bold">حاجات ليها حكاية</AppText>
          <AppText muted>عناصر أصحابها كتبوا عنها، قالوا ليه بيبدلوها، أو وضحوا لمين ممكن تفيد.</AppText>
        </View>
        {itemsLoading ? <AppText>جارٍ تحميل الحكايات...</AppText> : null}
        {!itemsLoading && itemsError ? (
          <View style={styles.stateBox}>
            <AppText style={styles.errorText}>تعذر تحميل العناصر ذات الحكاية حالياً.</AppText>
            <AppButton label="إعادة المحاولة" variant="neutral" onPress={loadItems} />
          </View>
        ) : null}
        {!itemsLoading && !itemsError && items.length === 0 ? (
          <View style={styles.stateBox}>
            <EmptyState title="لسه الحكايات المعروضة قليلة" description="عند نشر عناصر مع حكاية أو سبب واضح للتبديل، هتظهر هنا." />
            <AppButton label="اعرض حاجة" onPress={() => router.push('/(tabs)/add')} />
          </View>
        ) : null}
        {!itemsLoading && !itemsError && items.length > 0 ? (
          <View style={styles.itemsList}>
            {items.map((item) => {
              const metadata = [item.category, item.city, item.area].filter(Boolean).join(' / ');
              return (
                <Pressable key={item.id} onPress={() => router.push(`/item/${item.id}`)} style={styles.itemCard}>
                  {item.imageUrl ? (
                    <ExpoImage source={{ uri: item.imageUrl }} style={styles.itemImage} contentFit="cover" />
                  ) : (
                    <View style={styles.itemPlaceholder}><AppText muted>بدون صورة</AppText></View>
                  )}
                  <View style={styles.itemContent}>
                    <AppText weight="semibold" numberOfLines={1}>{item.title}</AppText>
                    <View style={styles.labelPill}><AppText style={styles.labelText}>{item.storyLabel}</AppText></View>
                    <AppText numberOfLines={3}>{item.storySnippet}</AppText>
                    {metadata ? <AppText muted numberOfLines={1}>{metadata}</AppText> : null}
                    {item.ownerDisplayName ? <AppText muted numberOfLines={1}>بواسطة {item.ownerDisplayName}</AppText> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroBox: { gap: spacing.sm },
  heroTitle: { fontSize: 24 },
  sectionHeader: { gap: spacing.xs, marginBottom: spacing.sm },
  stateBox: { gap: spacing.sm },
  errorText: { color: '#B42318' },
  storyRail: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  storyTile: { width: 90, gap: spacing.xs, alignItems: 'center' },
  storyAvatar: { width: 64, height: 64, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border },
  storyAvatarFallback: {
    width: 64,
    height: 64,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyName: { textAlign: 'center' },
  storyCount: { fontSize: 12 },
  itemsList: { gap: spacing.sm },
  itemCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  itemImage: { width: '100%', height: 150, backgroundColor: colors.background },
  itemPlaceholder: { height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  itemContent: { padding: spacing.md, gap: spacing.xs },
  labelPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  labelText: { color: colors.primary, fontSize: 12 },
});
