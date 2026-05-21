import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export type ItemShareCardData = {
  title: string;
  imageUrl?: string | null;
  category?: string | null;
  condition?: string | null;
  location?: string | null;
};

type ItemShareCardProps = {
  item: ItemShareCardData;
};

export function ItemShareCard({ item }: ItemShareCardProps) {
  const meta = [item.category, item.condition, item.location].filter((value) => !!value?.trim());

  return (
    <View style={styles.canvas}>
      <LinearGradient colors={['#F7F5FF', '#FFFFFF']} style={styles.card}>
        <View style={styles.imageShell}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.imageFallback}>
              <AppText muted>بدون صورة</AppText>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <AppText weight="bold" style={styles.title} numberOfLines={2}>{item.title || 'عنصر بدون عنوان'}</AppText>
          {meta.length ? <AppText muted style={styles.meta} numberOfLines={1}>{meta.join(' • ')}</AppText> : null}
          <AppText style={styles.tagline}>حاجة ممكن تبدأ بيها تبديلة جديدة</AppText>
        </View>

        <View style={styles.footer}>
          <AppText weight="bold" style={styles.brand}>تِسوى • Teswa</AppText>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { width: 1080, height: 1080, backgroundColor: colors.surface, padding: 44 },
  card: {
    flex: 1,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  imageShell: { flex: 0.62, backgroundColor: colors.primarySoft },
  image: { width: '100%', height: '100%' },
  imageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 0.3, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  title: { fontSize: 44, lineHeight: 56, color: colors.text },
  meta: { fontSize: 28 },
  tagline: { fontSize: 30, lineHeight: 42, color: colors.text },
  footer: {
    flex: 0.08,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    justifyContent: 'flex-end',
  },
  brand: { fontSize: 24, color: colors.textMuted },
});
