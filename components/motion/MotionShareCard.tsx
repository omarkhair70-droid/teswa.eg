import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { MotionShareMoment } from '@/lib/motion-share';

export type MotionShareCardProps = {
  moment: MotionShareMoment;
};

export function MotionShareCard({ moment }: MotionShareCardProps) {
  const isMoving = moment.kind === 'moving_item';

  return (
    <LinearGradient colors={['#2B1B14', '#3B2A22', '#1F2D2A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.topBrand}>
        <AppText style={styles.brandLabel}>تِسوى</AppText>
        <AppText weight="bold" style={styles.brandHeadline}>{isMoving ? 'باب بدأ يتحرك' : 'حكاية تستحق أن تُرى'}</AppText>
      </View>

      <View style={styles.imageFrame}>
        {moment.imageUrl ? (
          <ExpoImage source={{ uri: moment.imageUrl }} style={styles.image} contentFit="cover" transition={120} cachePolicy="memory-disk" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <AppText style={styles.imagePlaceholderText}>عنصر من تِسوى</AppText>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <AppText weight="semibold" numberOfLines={2} style={styles.title}>{moment.title}</AppText>

        {isMoving ? (
          <>
            <AppText style={styles.badgeLine}>{moment.badge}</AppText>
            {moment.metadata ? <AppText numberOfLines={1} style={styles.mutedLine}>{moment.metadata}</AppText> : null}
            {moment.ownerDisplayName ? <AppText numberOfLines={1} style={styles.mutedLine}>بواسطة {moment.ownerDisplayName}</AppText> : null}
          </>
        ) : (
          <>
            <AppText style={styles.storyLabel}>{moment.storyLabel}</AppText>
            <AppText numberOfLines={4} style={styles.snippet}>{moment.storySnippet}</AppText>
            {moment.metadata ? <AppText numberOfLines={1} style={styles.mutedLine}>{moment.metadata}</AppText> : null}
            {moment.ownerDisplayName ? <AppText numberOfLines={1} style={styles.mutedLine}>بواسطة {moment.ownerDisplayName}</AppText> : null}
          </>
        )}
      </View>

      <View style={styles.bottomSignature}>
        <AppText style={styles.signatureTitle}>من حركة تِسوى</AppText>
        <AppText style={styles.signatureSubtitle}>أبواب، حكايات، وبدائل تستحق أن تُرى.</AppText>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 340,
    minHeight: 560,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  topBrand: { gap: spacing.xs },
  brandLabel: { color: '#EACBB8', fontSize: 12 },
  brandHeadline: { color: colors.white, fontSize: 24 },
  imageFrame: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: '#3B2A22' },
  image: { width: '100%', height: 220 },
  imagePlaceholder: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4D352A' },
  imagePlaceholderText: { color: '#F3E6DE' },
  content: { gap: spacing.xs },
  title: { color: colors.white, fontSize: 20 },
  badgeLine: { color: '#F3D7C8', fontSize: 13 },
  mutedLine: { color: '#D9C9BE', fontSize: 13 },
  storyLabel: { color: '#BEE8E1', fontSize: 13 },
  snippet: { color: '#F1E6DE', fontSize: 14 },
  bottomSignature: { marginTop: 'auto', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', gap: spacing.xs },
  signatureTitle: { color: '#EFD4C5', fontSize: 13 },
  signatureSubtitle: { color: '#D8C7BC', fontSize: 12 },
});
