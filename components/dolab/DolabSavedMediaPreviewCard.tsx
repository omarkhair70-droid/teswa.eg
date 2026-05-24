import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { DolabSyncBadge } from '@/components/dolab/DolabSyncBadge';

export type DolabSavedMediaCardModel = {
  id: string;
  remoteMediaId: string;
  mediaType: 'image' | 'video' | 'audio';
  mediaTypeLabel: string;
  storagePath: string;
  signedUrl?: string;
  linkedItemTitle?: string;
  meta: string;
  previewStatus: 'loading' | 'ready' | 'unavailable' | 'failed';
};

export function DolabSavedMediaPreviewCard({ item, onDelete }: { item: DolabSavedMediaCardModel; onDelete?: (item: DolabSavedMediaCardModel) => void }) {
  const renderPreview = () => {
    if (item.mediaType === 'image' && item.signedUrl) {
      return <Image source={{ uri: item.signedUrl }} style={styles.previewImage} resizeMode="cover" />;
    }

    const iconName = item.mediaType === 'video' ? 'play-circle-outline' : 'mic-outline';
    const text = item.mediaType === 'video' ? 'فيديو محفوظ' : item.mediaType === 'audio' ? 'صوت محفوظ' : 'صورة محفوظة';

    return (
      <View style={styles.previewFallback}>
        <Ionicons name={iconName} size={26} color={colors.textMuted} />
        <AppText muted style={styles.previewFallbackText}>{text}</AppText>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      {renderPreview()}
      <View style={styles.body}>
        <View style={styles.rowBetween}>
          <AppText weight="semibold">{item.mediaTypeLabel}</AppText>
          <DolabSyncBadge state="saved" />
        </View>
        {item.linkedItemTitle ? <AppText muted style={styles.small}>مرتبط: {item.linkedItemTitle}</AppText> : null}
        <AppText muted style={styles.small}>{item.meta}</AppText>
        {onDelete ? (
          <Pressable onPress={() => onDelete(item)} accessibilityRole="button" accessibilityLabel="حذف ميديا محفوظة من الدولاب">
            <AppText style={styles.deleteText}>حذف</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: '#FFFEFC',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.background,
  },
  previewFallback: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 4,
  },
  previewFallbackText: {
    fontSize: 12,
  },
  body: {
    padding: spacing.sm,
    gap: 2,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  small: { fontSize: 12 },
  deleteText: { fontSize: 12, color: colors.danger },
});
