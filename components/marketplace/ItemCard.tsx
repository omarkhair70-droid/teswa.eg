import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MarketplaceItem } from '@/lib/marketplace-items';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ItemCard({ item }: { item: MarketplaceItem }) {
  const metadata = [item.category, item.condition, item.location].filter(Boolean).join(' • ');
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
      <AppCard>
        <View style={styles.wrapper}>
          {item.imageUrl ? (
            <ExpoImage source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" transition={160} recyclingKey={item.id} />
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
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  pressable: { marginBottom: spacing.md },
  wrapper: { gap: spacing.md },
  image: { width: '100%', height: 170, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  placeholder: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  content: { gap: spacing.xs },
});
