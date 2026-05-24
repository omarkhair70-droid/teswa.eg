import { StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { DolabSavedMediaGrid } from '@/components/dolab/DolabSavedMediaGrid';
import type { DolabSavedMediaCardModel } from '@/components/dolab/DolabSavedMediaPreviewCard';

type SavedItem = {
  id: string;
  title: string;
  description: string;
  mediaCount: number;
  badge: string;
};

type SavedNote = {
  id: string;
  body: string;
  label: string;
  createdAt: string;
};

export function DolabSavedLibrarySection({
  items,
  notes,
  media,
  onDeleteNote,
  onDeleteItem,
  onDeleteMedia,
  onEditItem,
}: {
  items: SavedItem[];
  notes: SavedNote[];
  media: DolabSavedMediaCardModel[];
  onDeleteNote?: (id: string) => void;
  onDeleteItem?: (id: string) => void;
  onDeleteMedia?: (item: DolabSavedMediaCardModel) => void;
  onEditItem?: (id: string) => void;
}) {
  const isEmpty = items.length === 0 && notes.length === 0 && media.length === 0;

  return (
    <AppCard>
      <View style={styles.header}>
        <AppText weight="bold">المحفوظ في دولابك</AppText>
        <AppText muted>حاجات محفوظة سحابيًا وتفضل موجودة لما ترجع.</AppText>
      </View>

      {isEmpty ? (
        <AppText muted style={styles.smallText}>
          لسه مفيش حاجة محفوظة سحابيًا. ابدأ بمسودة أو ميديا.
        </AppText>
      ) : (
        <>
          {items.map((item) => (
            <View key={item.id} style={styles.row}>
              <AppText style={styles.smallText}>• {item.title} · {item.badge} · ميديا {item.mediaCount}</AppText>
              <View style={styles.rowActions}>
                {onEditItem ? <AppText style={styles.action} onPress={() => onEditItem(item.id)}>تعديل</AppText> : null}
                {onDeleteItem ? <AppText style={styles.actionDanger} onPress={() => onDeleteItem(item.id)}>حذف</AppText> : null}
              </View>
            </View>
          ))}

          {notes.slice(0, 3).map((note) => (
            <View key={note.id} style={styles.row}>
              <AppText style={styles.smallText}>• ملاحظة ({note.label}): {note.body}</AppText>
              {onDeleteNote ? <AppText style={styles.actionDanger} onPress={() => onDeleteNote(note.id)}>حذف</AppText> : null}
            </View>
          ))}

          <DolabSavedMediaGrid media={media.slice(0, 6)} onDeleteMedia={onDeleteMedia} />
        </>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 3,
    marginBottom: spacing.xs,
  },
  smallText: {
    fontSize: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowActions: { flexDirection: 'row', gap: spacing.sm },
  action: { fontSize: 12 },
  actionDanger: { fontSize: 12, color: '#B3261E' },
});
