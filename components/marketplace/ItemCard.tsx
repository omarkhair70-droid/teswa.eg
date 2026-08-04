import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MarketplaceItem } from '@/lib/marketplace-items';
import { useAuth } from '@/lib/auth';
import { setItemLiked } from '@/lib/item-likes';
import { getItemConditionLabel } from '@/lib/item-display';

function ItemCardComponent({ item }: { item: MarketplaceItem }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [optimisticLike, setOptimisticLike] = useState<{ itemId: string; liked: boolean; count: number } | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const activeOptimisticLike = optimisticLike?.itemId === item.id ? optimisticLike : null;
  const likedByMe = activeOptimisticLike?.liked ?? item.likedByMe;
  const likeCount = activeOptimisticLike?.count ?? item.likeCount;
  const conditionLabel = getItemConditionLabel(item.condition);
  const shouldShowImage = Boolean(item.imageUrl && failedImageUrl !== item.imageUrl);

  const metadata = useMemo(
    () =>
      [
        item.category ? { key: 'category', label: item.category, icon: 'pricetag-outline' as const, color: colors.primary } : null,
        conditionLabel ? { key: 'condition', label: conditionLabel, icon: 'shield-checkmark-outline' as const, color: colors.accent } : null,
        item.location ? { key: 'location', label: item.location, icon: 'location-outline' as const, color: '#8A5A2D' } : null,
      ].filter(Boolean) as { key: string; label: string; icon: ComponentProps<typeof Ionicons>['name']; color: string }[],
    [conditionLabel, item.category, item.location],
  );

  const handlePress = useCallback(() => {
    router.push(`/item/${item.id}`);
  }, [item.id]);

  const handleLikePress = useCallback(async (event: GestureResponderEvent) => {
    event.stopPropagation();

    if (likePending) return;
    if (!userId) {
      router.push('/(auth)/login');
      return;
    }

    const nextLiked = !likedByMe;
    const previousCount = likeCount;
    setOptimisticLike({ itemId: item.id, liked: nextLiked, count: Math.max(0, previousCount + (nextLiked ? 1 : -1)) });
    setLikePending(true);

    try {
      const result = await setItemLiked({ itemId: item.id, userId, liked: nextLiked });
      if (!result.ok) {
        setOptimisticLike({ itemId: item.id, liked: !nextLiked, count: previousCount });
      }
    } catch {
      setOptimisticLike({ itemId: item.id, liked: !nextLiked, count: previousCount });
    } finally {
      setLikePending(false);
    }
  }, [item.id, likeCount, likePending, likedByMe, userId]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressablePressed]}
    >
      <LinearGradient colors={['rgba(255,253,248,0.98)', 'rgba(255,247,236,0.95)', 'rgba(238,216,203,0.42)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.wrapper}>
          <View style={styles.imageFrame}>
            <View style={styles.imageLoadingBackdrop}>
              <Ionicons name="image-outline" size={22} color="rgba(184,98,63,0.42)" />
            </View>
            {shouldShowImage ? (
              <ExpoImage
                source={{ uri: item.imageUrl! }}
                style={styles.image}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={140}
                recyclingKey={item.id}
                onError={() => setFailedImageUrl(item.imageUrl)}
              />
            ) : (
              <LinearGradient colors={['#FFF6E8', colors.primarySoft, 'rgba(62,124,115,0.18)']} style={[styles.image, styles.placeholder]}>
                <View style={styles.placeholderIcon}><Ionicons name={item.imageUrl ? 'cloud-offline-outline' : 'image-outline'} size={22} color={colors.primary} /></View>
                <AppText muted weight="semibold" style={styles.placeholderText}>{item.imageUrl ? 'تعذر عرض الصورة' : 'لا توجد صورة'}</AppText>
              </LinearGradient>
            )}
            <LinearGradient colors={['rgba(29,26,22,0)', 'rgba(29,26,22,0.16)']} style={styles.imageShade} />
            <Pressable onPress={handleLikePress} disabled={likePending} style={styles.likeChip} accessibilityRole="button" accessibilityLabel={likedByMe ? 'إلغاء الإعجاب' : 'إعجاب'}>
              <Ionicons name={likedByMe ? 'heart' : 'heart-outline'} size={14} color={colors.primary} />
              <AppText style={styles.likeChipText} weight="semibold">{likeCount}</AppText>
            </Pressable>
            {item.hasVideoTeaser === true ? <View style={styles.videoBadge}><Ionicons name="play-circle-outline" size={15} color={colors.primary} /><AppText weight="semibold" style={styles.videoBadgeText}>لمحة فيديو</AppText></View> : null}
          </View>

          <View style={styles.content}>
            <AppText weight="bold" numberOfLines={2} style={styles.title}>{item.title}</AppText>
            <View style={styles.metadataRow}>
              {metadata.map((meta) => (
                <View key={meta.key} style={styles.metaPill}>
                  <Ionicons name={meta.icon} size={13} color={meta.color} />
                  <AppText muted numberOfLines={1} style={styles.metaText}>{meta.label}</AppText>
                </View>
              ))}
            </View>
            {item.ownerDisplayName ? <View style={styles.ownerRow}><View style={styles.ownerIcon}><Ionicons name="person-outline" size={13} color={colors.primary} /></View><AppText muted numberOfLines={1} style={styles.ownerText}>بواسطة {item.ownerDisplayName}</AppText></View> : null}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function areItemCardPropsEqual(prev: { item: MarketplaceItem }, next: { item: MarketplaceItem }) {
  return prev.item.id === next.item.id && prev.item.title === next.item.title && prev.item.imageUrl === next.item.imageUrl && prev.item.category === next.item.category && prev.item.condition === next.item.condition && prev.item.location === next.item.location && prev.item.ownerDisplayName === next.item.ownerDisplayName && prev.item.hasVideoTeaser === next.item.hasVideoTeaser && prev.item.likeCount === next.item.likeCount && prev.item.likedByMe === next.item.likedByMe;
}

export const ItemCard = memo(ItemCardComponent, areItemCardPropsEqual);

const styles = StyleSheet.create({
  pressable: { marginBottom: 10 },
  pressablePressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  card: { borderRadius: radii.lg, borderWidth: 1, borderColor: 'rgba(184,98,63,0.14)', padding: 10, shadowColor: colors.primary, shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  wrapper: { gap: 10 },
  imageFrame: { position: 'relative', borderRadius: radii.lg, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: 'rgba(255,253,248,0.86)', overflow: 'hidden' },
  imageLoadingBackdrop: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(238,216,203,0.5)' },
  image: { width: '100%', height: 168, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  imageShade: { ...StyleSheet.absoluteFillObject },
  likeChip: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 5, backgroundColor: 'rgba(255,253,248,0.95)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)' },
  likeChipText: { color: colors.primary, fontSize: 12 },
  placeholder: { justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  placeholderIcon: { width: 48, height: 48, borderRadius: radii.round, backgroundColor: 'rgba(255,253,248,0.68)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.14)', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 13 },
  videoBadge: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: 'rgba(255,253,248,0.94)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.22)' },
  videoBadgeText: { color: colors.primary, fontSize: 12 },
  content: { gap: 7 },
  title: { fontSize: 16, lineHeight: 22, textAlign: 'auto', writingDirection: 'auto' },
  metadataRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  metaPill: { maxWidth: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: 'rgba(221,208,197,0.72)', borderRadius: radii.round, backgroundColor: 'rgba(255,253,248,0.7)', paddingHorizontal: spacing.sm, paddingVertical: 5 },
  metaText: { fontSize: 11, flexShrink: 1 },
  ownerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, paddingTop: 2 },
  ownerIcon: { width: 24, height: 24, borderRadius: radii.round, backgroundColor: 'rgba(184,98,63,0.1)', alignItems: 'center', justifyContent: 'center' },
  ownerText: { flex: 1, fontSize: 12, textAlign: 'auto', writingDirection: 'auto' },
});
