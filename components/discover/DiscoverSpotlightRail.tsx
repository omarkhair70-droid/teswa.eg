import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MarketplaceItem } from '@/lib/marketplace-items';

type Props = { items: MarketplaceItem[] };

export function DiscoverSpotlightRail({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <View style={styles.box}>
      <AppText style={styles.eyebrow}>لمحة ذكية</AppText>
      <AppText weight="bold" style={styles.title}>عناصر تستحق نظرة أقرب</AppText>
      <AppText muted>رتبنا لك عناصر فيها إشارات أوضح: صورة، وصف، أو لمحة فيديو.</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {items.map((item) => (
          <Pressable key={item.id} onPress={() => router.push(`/item/${item.id}`)} style={styles.card}>
            {item.imageUrl ? <ExpoImage source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" transition={120} /> : <LinearGradient colors={['#F6EFE2', '#ECE2D4']} style={styles.image} />}
            <View style={styles.content}>
              <AppText weight="bold" numberOfLines={1}>{item.title}</AppText>
              <AppText muted numberOfLines={1}>{[item.category, item.location].filter(Boolean).join(' • ')}</AppText>
              {item.hasVideoTeaser ? <AppText style={styles.badge}>لمحة فيديو</AppText> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing.xs }, eyebrow: { color: colors.primary, fontSize: 12 }, title: { fontSize: 20 }, rail: { gap: spacing.sm, paddingTop: spacing.xs }, card: { width: 190, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.8)' }, image: { width: '100%', height: 100 }, content: { padding: spacing.sm, gap: 6 }, badge: { color: colors.primary, fontSize: 12 } });
