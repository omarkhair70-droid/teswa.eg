import { ScrollView, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';
import { DolabMediaCard } from './DolabMediaCard';

type Props = {
  pendingMedia: DolabPendingMedia[];
  selectedMediaIds?: string[];
  mode: 'preview' | 'selectable';
  onRemove?: (mediaId: string) => void;
  onToggleSelect?: (mediaId: string) => void;
  emptyText?: string;
};

export function DolabPendingMediaStrip({ pendingMedia, selectedMediaIds = [], mode, onRemove, onToggleSelect, emptyText }: Props) {
  if (pendingMedia.length === 0) {
    return <AppText muted style={styles.empty}>{emptyText ?? 'لا توجد ميديا محلية الآن.'}</AppText>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {pendingMedia.map((item) => (
        <DolabMediaCard
          key={item.id}
          item={item}
          selectable={mode === 'selectable'}
          selected={selectedMediaIds.includes(item.id)}
          onPress={mode === 'selectable' ? () => onToggleSelect?.(item.id) : undefined}
          onRemove={onRemove ? () => onRemove(item.id) : undefined}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ row: { gap: spacing.xs }, empty: { fontSize: 12 } });
