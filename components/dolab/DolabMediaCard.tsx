import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { formatMediaDimensions, formatMediaDuration, formatMediaSize } from '@/lib/dolab/local-media';
import { formatCompressionSavings } from '@/lib/dolab/media-compression';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import { DolabAudioPlaceholderCard } from './DolabAudioPlaceholderCard';
import { DolabPressableCard } from './DolabPressableCard';

type Props = {
  item: DolabPendingMedia;
  selectable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
};

export function DolabMediaCard({ item, selectable = false, selected = false, onPress, onRemove }: Props) {
  const details = [formatMediaDuration(item.durationMs), formatMediaDimensions(item.width, item.height), formatMediaSize(item.sizeBytes)]
    .filter(Boolean)
    .join(' • ');

  const compressionLabel =
    item.compressionStatus === 'compressing'
      ? 'جاري التحسين'
      : item.compressionStatus === 'pending'
        ? 'يتحسن قبل الرفع'
        : item.compressionStatus === 'compressed'
          ? 'مضغوط للرفع'
          : item.compressionStatus === 'failed'
            ? 'تعذر الضغط'
            : 'بدون ضغط';
  const savingsResult = formatCompressionSavings(item.originalSizeBytes, item.compressedSizeBytes);

  const uploadLabel =
    item.uploadStatus === 'uploading'
      ? 'جاري الرفع للسحابة'
      : item.uploadStatus === 'uploaded'
        ? 'في السحابة'
        : item.uploadStatus === 'failed'
          ? 'تعذر الرفع'
          : 'على الجهاز';

  const statusStyle =
    item.uploadStatus === 'uploaded'
      ? styles.statusBadgeSynced
      : item.uploadStatus === 'failed'
        ? styles.statusBadgeFailed
        : item.uploadStatus === 'uploading'
          ? styles.statusBadgePending
          : styles.statusBadgeLocal;

  return (
    <DolabPressableCard
      style={[styles.card, selectable && styles.selectableCard, selected && styles.selectedCard]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`عنصر ميديا ${item.mediaType === 'image' ? 'صورة' : item.mediaType === 'video' ? 'فيديو' : 'صوت'}`}
    >
      {item.mediaType === 'image' ? (
        <Image source={{ uri: item.uri }} style={styles.image} />
      ) : item.mediaType === 'video' ? (
        <View style={styles.videoPlaceholder}>
          <Ionicons name="play-circle-outline" size={24} color={colors.primary} />
          <AppText muted style={styles.fileName} numberOfLines={1}>{item.fileName ?? 'video.mp4'}</AppText>
        </View>
      ) : (
        <DolabAudioPlaceholderCard title={item.fileName ?? 'ملاحظة صوتية'} subtitle={formatMediaDuration(item.durationMs) ?? 'بدون مدة'} />
      )}

      <View style={styles.badge}><AppText style={styles.badgeText}>{item.mediaType === 'image' ? 'صورة' : item.mediaType === 'video' ? 'فيديو' : 'تسجيل صوتي'}</AppText></View>
      <View style={[styles.statusBadge, statusStyle]}><AppText style={styles.statusBadgeText}>{uploadLabel}</AppText></View>
      <View style={styles.compressionBadge}><AppText style={styles.compressionBadgeText}>{compressionLabel}</AppText></View>
      {item.uploadError ? <AppText style={styles.errorText} numberOfLines={2}>{item.uploadError}</AppText> : null}
      {savingsResult.data ? <AppText muted style={styles.meta} numberOfLines={1}>{savingsResult.data}</AppText> : null}
      {details ? <AppText muted style={styles.meta} numberOfLines={1}>{details}</AppText> : null}
      {item.mediaType === 'audio' ? <AppText muted style={styles.meta}>تقدر تلاقيه كمان في ملاحظاتك.</AppText> : null}

      {onRemove ? (
        <Pressable style={styles.removeButton} onPress={onRemove} accessibilityRole="button" accessibilityLabel="حذف عنصر ميديا من نسخة الجهاز">
          <Ionicons name="close-circle" size={18} color={colors.danger} />
        </Pressable>
      ) : null}
      {selected ? <View style={styles.selectedOverlay}><Ionicons name="checkmark-circle" size={20} color={colors.white} /></View> : null}
    </DolabPressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xs,
    backgroundColor: '#FFFEFC',
    gap: 6,
    position: 'relative',
  },
  selectableCard: { paddingBottom: spacing.sm },
  selectedCard: { borderColor: colors.primary, backgroundColor: '#FFF7EE' },
  image: { width: '100%', height: 88, borderRadius: radii.md },
  videoPlaceholder: {
    height: 88,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    backgroundColor: '#FFF8F0',
  },
  fileName: { fontSize: 11, maxWidth: 120 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
  },
  badgeText: { fontSize: 11, color: colors.primary },
  meta: { fontSize: 11 },
  errorText: { fontSize: 11, color: colors.danger },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.round,
    borderWidth: 1,
  },
  statusBadgeLocal: { backgroundColor: '#F4F1EC', borderColor: '#DDD4C8' },
  statusBadgePending: { backgroundColor: '#FFF6E8', borderColor: '#E8C98F' },
  statusBadgeSynced: { backgroundColor: '#EFFAF1', borderColor: '#B9DCC5' },
  statusBadgeFailed: { backgroundColor: '#FFF0EF', borderColor: '#F1B8B4' },
  statusBadgeText: { fontSize: 11, color: colors.text },
  compressionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.round,
    backgroundColor: '#EFFAF1',
  },
  compressionBadgeText: { fontSize: 11, color: '#2F8A57' },
  removeButton: { position: 'absolute', top: 6, left: 6 },
  selectedOverlay: { position: 'absolute', bottom: 6, left: 6, backgroundColor: colors.primary, borderRadius: radii.round },
});
