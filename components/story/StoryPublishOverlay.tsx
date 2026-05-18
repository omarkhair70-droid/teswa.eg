import { Modal, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import LottieView from 'lottie-react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { StoryPublishProgress } from '@/lib/stories';

export type StoryPublishOverlayProps = {
  visible: boolean;
  progress: StoryPublishProgress | null;
  asset: ImagePicker.ImagePickerAsset | null;
};

function getHeading(stage: StoryPublishProgress['stage'] | undefined) {
  if (stage === 'preparing') return 'نجهّز القصة';
  if (stage === 'uploading') return 'نرفع قصتك';
  if (stage === 'saving') return 'نثبت النشر';
  if (stage === 'cleanup') return 'نرتّب آخر خطوة';
  return 'جارٍ نشر القصة';
}

export function StoryPublishOverlay({ visible, progress, asset }: StoryPublishOverlayProps) {
  if (!visible) return null;

  const percent = typeof progress?.uploadPercent === 'number' ? Math.max(0, Math.min(100, Math.round(progress.uploadPercent))) : null;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <LottieView source={require('@/assets/lottie/story-publishing-pulse.json')} autoPlay loop style={styles.lottie} />
          <AppText weight="bold" style={styles.title}>{getHeading(progress?.stage)}</AppText>
          <AppText muted style={styles.description}>{progress?.message ?? 'استنّى لحظة، بنجهّزها علشان تظهر بشكل سليم.'}</AppText>

          {percent !== null ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressBarTrack}><View style={[styles.progressBarFill, { width: `${percent}%` }]} /></View>
              <AppText style={styles.percentText}>{percent}%</AppText>
            </View>
          ) : (
            <AppText muted>نعمل عليها الآن...</AppText>
          )}

          {asset?.type === 'image' ? (
            <View style={styles.assetPreviewWrap}>
              <ExpoImage source={{ uri: asset.uri }} style={styles.assetPreview} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            </View>
          ) : null}

          {asset?.type === 'video' ? (
            <View style={styles.videoBadge}><AppText muted>فيديو جاهز للنشر</AppText></View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 11, 17, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  lottie: { width: 196, height: 196 },
  title: { fontSize: 24, color: colors.text },
  description: { textAlign: 'center', lineHeight: 22 },
  progressWrap: { width: '100%', gap: spacing.xs, marginTop: spacing.xs },
  progressBarTrack: {
    height: 8,
    borderRadius: radii.round,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radii.round },
  percentText: { color: colors.textMuted, textAlign: 'center' },
  assetPreviewWrap: {
    marginTop: spacing.xs,
    width: 84,
    height: 108,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  assetPreview: { width: '100%', height: '100%' },
  videoBadge: {
    marginTop: spacing.xs,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
