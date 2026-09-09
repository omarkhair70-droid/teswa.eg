import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { StoryDiscoveryItem } from '@/lib/story-discovery';
import { ABSOLUTE_FILL } from '@/lib/styles/absolute-fill';

type Props = { items: StoryDiscoveryItem[]; loading?: boolean; errorMessage?: string | null; onRetry?: () => void };

function StoryLoadingState() {
  return (
    <View style={styles.loadingRail}>
      {[0, 1].map((index) => (
        <View key={index} style={styles.loadingCard}>
          <View style={styles.loadingImage} />
          <View style={styles.loadingCopy}>
            <View style={[styles.loadingLine, styles.loadingLineShort]} />
            <View style={styles.loadingLine} />
            <View style={[styles.loadingLine, styles.loadingLineMedium]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DiscoverStoryHighlightsRail({ items, loading = false, errorMessage = null, onRetry }: Props) {
  if (!loading && !errorMessage && items.length === 0) return null;

  return (
    <View style={styles.box}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText weight="semibold" style={styles.eyebrow}>ورا كل حاجة حكاية</AppText>
          <AppText weight="bold" style={styles.title}>افهم العنصر من صاحبه</AppText>
          <AppText muted style={styles.description}>سبب التبديل والتفاصيل الصغيرة أحيانًا تقول أكثر من الصورة.</AppText>
        </View>
        <View style={styles.headingIcon}>
          <Ionicons name="book-outline" size={18} color="#A96A32" />
        </View>
      </View>

      {loading ? <StoryLoadingState /> : null}

      {errorMessage ? (
        <View style={styles.errorBox}>
          <View style={styles.errorCopy}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.primary} />
            <AppText muted style={styles.errorText}>{errorMessage}</AppText>
          </View>
          {onRetry ? <AppButton label="إعادة المحاولة" variant="neutral" size="sm" onPress={onRetry} /> : null}
        </View>
      ) : null}

      {!loading && !errorMessage && items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {items.map((item) => {
            const meta = [item.category, item.city].filter(Boolean).join(' • ');

            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`افتح حكاية ${item.title}`}
                onPress={() => router.push(`/item/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.imageWrap}>
                  {item.imageUrl ? (
                    <ExpoImage
                      source={{ uri: item.imageUrl }}
                      style={styles.image}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={120}
                    />
                  ) : (
                    <LinearGradient colors={['#FFF2E0', '#EBDCC5']} style={styles.image} />
                  )}
                  <View style={styles.storyBadge}>
                    <Ionicons name="chatbubble-ellipses-outline" size={11} color={colors.primary} />
                    <AppText weight="semibold" numberOfLines={1} style={styles.storyLabel}>{item.storyLabel}</AppText>
                  </View>
                </View>
                <View style={styles.content}>
                  <AppText weight="bold" numberOfLines={1} style={styles.itemTitle}>{item.title}</AppText>
                  <AppText muted numberOfLines={2} style={styles.snippet}>{item.storySnippet}</AppText>
                  <View style={styles.metaRow}>
                    {meta ? <AppText muted numberOfLines={1} style={styles.meta}>{meta}</AppText> : <View />}
                    {item.hasVideoTeaser ? <Ionicons name="play-circle-outline" size={15} color={colors.primary} /> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  headingRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: '#A96A32', fontSize: 11 },
  title: { fontSize: 18, lineHeight: 24 },
  description: { fontSize: 11, lineHeight: 17 },
  headingIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(169,106,50,0.1)',
  },
  loadingRail: { flexDirection: 'row-reverse', gap: spacing.sm, overflow: 'hidden' },
  loadingCard: { width: 214, borderRadius: radii.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  loadingImage: { height: 106, backgroundColor: 'rgba(221,208,197,0.48)' },
  loadingCopy: { padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.white },
  loadingLine: { height: 10, width: '88%', borderRadius: radii.round, backgroundColor: 'rgba(221,208,197,0.52)' },
  loadingLineShort: { width: '42%' },
  loadingLineMedium: { width: '68%' },
  errorBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: 'rgba(184,98,63,0.06)' },
  errorCopy: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  errorText: { flex: 1, fontSize: 12 },
  rail: { gap: spacing.sm, paddingBottom: 2 },
  card: {
    width: 194,
    borderWidth: 1,
    borderColor: 'rgba(169,106,50,0.16)',
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  imageWrap: { height: 96, backgroundColor: colors.background },
  image: { ...ABSOLUTE_FILL },
  storyBadge: {
    position: 'absolute',
    right: spacing.sm,
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,253,248,0.92)',
  },
  storyLabel: { flex: 1, color: colors.primary, fontSize: 10 },
  content: { padding: spacing.sm, gap: 5 },
  itemTitle: { fontSize: 14 },
  snippet: { fontSize: 10, lineHeight: 15 },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  meta: { flex: 1, fontSize: 10 },
});
