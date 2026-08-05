import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MarketplaceItem } from '@/lib/marketplace-items';

type Props = { items: MarketplaceItem[] };

export function DiscoverSpotlightRail({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.box}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <AppText weight="semibold" style={styles.eyebrow}>اختيار تِسوى</AppText>
          <AppText weight="bold" style={styles.title}>يستاهل نظرة أقرب</AppText>
          <AppText muted style={styles.description}>عناصر مكتملة التفاصيل وتساعدك تبدأ قرار أوضح.</AppText>
        </View>
        <View style={styles.headingIcon}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {items.map((item) => {
          const meta = [item.category, item.location].filter(Boolean).join(' • ');

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`افتح ${item.title}`}
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
                  <LinearGradient colors={['#F6EBDD', '#E8D8C7']} style={styles.image} />
                )}
                <LinearGradient colors={['transparent', 'rgba(29,26,22,0.6)']} style={styles.imageOverlay} />
                {item.hasVideoTeaser ? (
                  <View style={styles.videoBadge}>
                    <Ionicons name="play" size={10} color={colors.white} />
                    <AppText weight="semibold" style={styles.videoBadgeText}>فيديو</AppText>
                  </View>
                ) : null}
              </View>
              <View style={styles.content}>
                <AppText weight="bold" numberOfLines={1} style={styles.itemTitle}>{item.title}</AppText>
                {meta ? <AppText muted numberOfLines={1} style={styles.meta}>{meta}</AppText> : null}
                <View style={styles.openRow}>
                  <AppText weight="semibold" style={styles.openText}>شوف التفاصيل</AppText>
                  <Ionicons name="arrow-back" size={13} color={colors.primary} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  headingRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.primary, fontSize: 11 },
  title: { fontSize: 18, lineHeight: 24 },
  description: { fontSize: 11, lineHeight: 17 },
  headingIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(184,98,63,0.1)',
  },
  rail: { gap: spacing.sm, paddingBottom: 2 },
  card: {
    width: 176,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.14)',
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  cardPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  imageWrap: { height: 100, backgroundColor: colors.background },
  image: { ...StyleSheet.absoluteFillObject },
  imageOverlay: { ...StyleSheet.absoluteFillObject },
  videoBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.round,
    backgroundColor: 'rgba(29,26,22,0.62)',
  },
  videoBadgeText: { color: colors.white, fontSize: 10 },
  content: { padding: spacing.sm, gap: 5 },
  itemTitle: { fontSize: 14 },
  meta: { fontSize: 10 },
  openRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 2 },
  openText: { color: colors.primary, fontSize: 11 },
});
