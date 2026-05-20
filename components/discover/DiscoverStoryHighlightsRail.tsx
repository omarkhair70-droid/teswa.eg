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

type Props = { items: StoryDiscoveryItem[]; loading?: boolean; errorMessage?: string | null; onRetry?: () => void };

export function DiscoverStoryHighlightsRail({ items, loading = false, errorMessage = null, onRetry }: Props) {
  if (!loading && !errorMessage && items.length === 0) return null;

  return (
    <View style={styles.box}>
      <AppText style={styles.eyebrow}>حكاية تقود لفرصة</AppText>
      <AppText weight="bold" style={styles.title}>عناصر تستاهل تفتحها</AppText>
      <AppText muted>القصص هنا مش للفرجة فقط؛ بتعطيك سياق يساعدك تبدأ محادثة مناسبة.</AppText>
      {loading ? <AppText>نجهّز العناصر ذات الحكاية...</AppText> : null}
      {errorMessage ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.primary} />
          <AppText>{errorMessage}</AppText>
          {onRetry ? <AppButton label="إعادة المحاولة" variant="neutral" onPress={onRetry} /> : null}
        </View>
      ) : null}
      {!loading && !errorMessage && items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {items.map((item) => (
            <Pressable key={item.id} onPress={() => router.push(`/item/${item.id}`)} style={styles.card}>
              {item.imageUrl ? (
                <ExpoImage source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              ) : (
                <LinearGradient colors={['#FFF2E0', '#EBDCC5']} style={styles.image} />
              )}
              <View style={styles.content}>
                <AppText style={styles.storyLabel}>{item.storyLabel}</AppText>
                <AppText weight="bold" numberOfLines={1}>{item.title}</AppText>
                <AppText muted numberOfLines={3}>{item.storySnippet}</AppText>
                <AppText muted numberOfLines={1}>{[item.category, item.city].filter(Boolean).join(' • ')}</AppText>
                {item.hasVideoTeaser ? <AppText style={styles.badge}>لمحة فيديو</AppText> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: spacing.xs }, eyebrow: { color: colors.primary, fontSize: 12 }, title: { fontSize: 20 }, errorRow: { gap: spacing.xs }, rail: { gap: spacing.sm, paddingTop: spacing.xs }, card: { width: 220, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.8)' }, image: { width: '100%', height: 110 }, content: { padding: spacing.sm, gap: 6 }, storyLabel: { color: colors.primary, fontSize: 12 }, badge: { color: colors.primary, fontSize: 12 } });
