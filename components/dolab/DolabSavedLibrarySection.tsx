import { StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { DolabSavedMediaGrid } from '@/components/dolab/DolabSavedMediaGrid';

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

type SavedMedia = {
  id: string;
  mediaTypeLabel: string;
  linkedItemTitle?: string;
  meta: string;
};

export function DolabSavedLibrarySection({
  items,
  notes,
  media,
}: {
  items: SavedItem[];
  notes: SavedNote[];
  media: SavedMedia[];
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
            <AppText key={item.id} style={styles.smallText}>
              • {item.title} · {item.badge} · ميديا {item.mediaCount}
            </AppText>
          ))}

          {notes.slice(0, 3).map((note) => (
            <AppText key={note.id} style={styles.smallText}>
              • ملاحظة ({note.label}): {note.body}
            </AppText>
          ))}

          <DolabSavedMediaGrid media={media.slice(0, 6)} />
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
});
