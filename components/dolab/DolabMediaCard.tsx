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
      ? 'بيتحسن...'
      : item.compressionStatus === 'pending'
        ? 'هيتحسن قبل الرفع'
        : item.compressionStatus === 'compressed'
          ? 'مضغوط'
          : item.compressionStatus === 'failed'
            ? 'فشل الضغط'
            : 'بدون ضغط';
  const savingsResult = formatCompressionSavings(item.originalSizeBytes, item.compressedSizeBytes);

  const uploadLabel =
    item.uploadStatus === 'uploading'
      ? 'بيتحفظ...'
      : item.uploadStatus === 'uploaded'
        ? 'محفوظ'
        : item.uploadStatus === 'failed'
          ? 'فشل الحفظ'
          : 'محلي';

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
        <DolabAudioPlaceholderCard title={item.fileName ?? 'ملاحظة صوتية محلية'} subtitle={formatMediaDuration(item.durationMs) ?? 'بدون مدة'} />
      )}

      <View style={styles.badge}><AppText style={styles.badgeText}>{item.mediaType === 'image' ? 'صورة' : item.mediaType === 'video' ? 'فيديو' : 'صوت'}</AppText></View>
      <View style={styles.statusBadge}><AppText style={styles.statusBadgeText}>{uploadLabel}</AppText></View>
      <View style={styles.compressionBadge}><AppText style={styles.compressionBadgeText}>{compressionLabel}</AppText></View>
      {savingsResult.data ? <AppText muted style={styles.meta} numberOfLines={1}>{savingsResult.data}</AppText> : null}
      {details ? <AppText muted style={styles.meta} numberOfLines={1}>{details}</AppText> : null}

      {onRemove ? (
        <Pressable style={styles.removeButton} onPress={onRemove} accessibilityRole="button" accessibilityLabel="حذف عنصر ميديا محلي">
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
  selectableCard: {
    paddingBottom: spacing.sm,
  },
  selectedCard: {
    borderColor: colors.primary,
    backgroundColor: '#FFF7EE',
  },
  image: {
    width: '100%',
    height: 88,
    borderRadius: radii.md,
  },
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
  fileName: {
    fontSize: 11,
    maxWidth: 120,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
  },
  badgeText: {
    fontSize: 11,
    color: colors.primary,
  },
  meta: {
    fontSize: 11,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.round,
    backgroundColor: '#EEF3FF',
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#2F5FB3',
  },
  compressionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.round,
    backgroundColor: '#EFFAF1',
  },
  compressionBadgeText: {
    fontSize: 11,
    color: '#2F8A57',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  selectedOverlay: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.round,
  },
});
