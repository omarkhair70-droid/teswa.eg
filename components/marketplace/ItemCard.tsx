import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MarketplaceItem } from '@/lib/marketplace-items';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ItemCard({ item }: { item: MarketplaceItem }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const metadata = [
    item.category ? { key: 'category', label: item.category, icon: 'pricetag-outline' as const, color: colors.primary } : null,
    item.condition ? { key: 'condition', label: item.condition, icon: 'shield-checkmark-outline' as const, color: colors.accent } : null,
    item.location ? { key: 'location', label: item.location, icon: 'location-outline' as const, color: '#8A5A2D' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; icon: ComponentProps<typeof Ionicons>['name']; color: string }>;

  return (
    <AnimatedPressable
      onPress={() => router.push(`/item/${item.id}`)}
      onPressIn={() => {
        scale.value = withTiming(0.988, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 250, mass: 0.75 });
      }}
      style={[styles.pressable, animatedStyle]}
    >
      <LinearGradient
        colors={['rgba(255,253,248,0.98)', 'rgba(255,246,232,0.92)', 'rgba(238,216,203,0.42)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.wrapper}>
          <View style={styles.imageFrame}>
            {item.imageUrl ? (
              <ExpoImage source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" transition={160} recyclingKey={item.id} />
            ) : (
              <LinearGradient colors={['#FFF6E8', colors.primarySoft, 'rgba(62,124,115,0.18)']} style={[styles.image, styles.placeholder]}>
                <View style={styles.placeholderIcon}>
                  <Ionicons name="image-outline" size={24} color={colors.primary} />
                </View>
                <AppText muted weight="semibold" style={styles.placeholderText}>الصورة لسه جاية</AppText>
              </LinearGradient>
            )}
            <LinearGradient colors={['rgba(29,26,22,0)', 'rgba(29,26,22,0.16)']} style={styles.imageShade} />
            {item.hasVideoTeaser === true ? (
              <View style={styles.videoBadge}>
                <Ionicons name="play-circle-outline" size={15} color={colors.primary} />
                <AppText weight="semibold" style={styles.videoBadgeText}>لمحة فيديو</AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.content}>
            <AppText weight="bold" numberOfLines={2} style={styles.title}>{item.title}</AppText>

            {metadata.length > 0 ? (
              <View style={styles.metadataRow}>
                {metadata.map((meta) => (
                  <View key={meta.key} style={styles.metaPill}>
                    <Ionicons name={meta.icon} size={13} color={meta.color} />
                    <AppText muted numberOfLines={1} style={styles.metaText}>{meta.label}</AppText>
                  </View>
                ))}
              </View>
            ) : null}

            {item.ownerDisplayName ? (
              <View style={styles.ownerRow}>
                <View style={styles.ownerIcon}>
                  <Ionicons name="person-outline" size={13} color={colors.primary} />
                </View>
                <AppText muted numberOfLines={1} style={styles.ownerText}>صاحبها {item.ownerDisplayName}</AppText>
              </View>
            ) : null}
          </View>
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  pressable: { marginBottom: spacing.md },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
    padding: spacing.md,
    shadowColor: colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  wrapper: { gap: spacing.md },
  imageFrame: {
    position: 'relative',
    borderRadius: radii.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(255,253,248,0.86)',
    overflow: 'hidden',
  },
  image: { width: '100%', height: 178, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  imageShade: { ...StyleSheet.absoluteFillObject },
  placeholder: { justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  placeholderIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,253,248,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { fontSize: 13 },
  videoBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,253,248,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.22)',
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  videoBadgeText: { color: colors.primary, fontSize: 12 },
  content: { gap: spacing.sm },
  title: { fontSize: 18, lineHeight: 25 },
  metadataRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaPill: {
    maxWidth: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(221,208,197,0.78)',
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,253,248,0.72)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  metaText: { fontSize: 12, flexShrink: 1 },
  ownerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  ownerIcon: {
    width: 24,
    height: 24,
    borderRadius: radii.round,
    backgroundColor: 'rgba(184,98,63,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerText: { flex: 1, fontSize: 13 },
});
