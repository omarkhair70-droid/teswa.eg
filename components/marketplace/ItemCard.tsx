import { Pressable, StyleSheet, View, Image } from 'react-native';
import { router } from 'expo-router';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MarketplaceItem } from '@/lib/marketplace-items';

export function ItemCard({ item }: { item: MarketplaceItem }) {
  const metadata = [item.category, item.condition, item.location].filter(Boolean).join(' • ');

  return (
    <Pressable onPress={() => router.push(`/item/${item.id}`)} style={styles.pressable}>
      <AppCard>
        <View style={styles.wrapper}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <AppText muted weight="semibold">بدون صورة</AppText>
            </View>
          )}

          <View style={styles.content}>
            <AppText weight="semibold" numberOfLines={2}>{item.title}</AppText>
            {metadata ? <AppText muted numberOfLines={1}>{metadata}</AppText> : null}
            {item.ownerDisplayName ? <AppText muted numberOfLines={1}>بواسطة {item.ownerDisplayName}</AppText> : null}
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { marginBottom: spacing.md },
  wrapper: { gap: spacing.md },
  image: { width: '100%', height: 170, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  placeholder: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  content: { gap: spacing.xs },
});
