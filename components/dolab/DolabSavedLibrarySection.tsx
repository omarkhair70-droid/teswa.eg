import { Pressable, StyleSheet, View } from 'react-native';
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
  publishedItemId?: string | null;
  isPublished?: boolean;
};

type SavedNote = { id: string; body: string; label: string; createdAt: string };

export function DolabSavedLibrarySection({ items, notes, media, onDeleteNote, onDeleteItem, onEditItem, onPublishItem, onOpenPublishedItem, onDeleteMedia }: { items: SavedItem[]; notes: SavedNote[]; media: DolabSavedMediaCardModel[]; onDeleteNote?: (id: string) => void; onDeleteItem?: (id: string) => void; onDeleteMedia?: (item: DolabSavedMediaCardModel) => void; onEditItem?: (id: string) => void; onPublishItem?: (id: string) => void; onOpenPublishedItem?: (publishedItemId: string) => void; }) {
  const isEmpty = items.length === 0 && notes.length === 0 && media.length === 0;
  return <AppCard><View style={styles.header}><AppText weight='bold'>المحفوظ في دولابك</AppText><AppText muted>حاجات محفوظة سحابيًا وتفضل موجودة لما ترجع.</AppText></View>{isEmpty ? <AppText muted style={styles.smallText}>لسه مفيش حاجة محفوظة سحابيًا. ابدأ بمسودة أو ميديا.</AppText> : <>{items.map((item) => <View key={item.id} style={styles.row}><AppText style={styles.smallText}>• {item.title} · {item.badge} · ميديا {item.mediaCount}</AppText><View style={styles.rowActions}>{item.isPublished && item.publishedItemId && onOpenPublishedItem ? <Pressable onPress={() => onOpenPublishedItem(item.publishedItemId!)} accessibilityRole='button' accessibilityLabel='افتح العرض المنشور'><AppText style={styles.action}>افتح العرض</AppText></Pressable> : onPublishItem ? <Pressable onPress={() => onPublishItem(item.id)} accessibilityRole='button' accessibilityLabel='انشر في السوق'><AppText style={styles.action}>انشر في السوق</AppText></Pressable> : null}{onEditItem ? <Pressable onPress={() => onEditItem(item.id)} accessibilityRole='button' accessibilityLabel='تعديل عنصر محفوظ'><AppText style={styles.action}>تعديل</AppText></Pressable> : null}{onDeleteItem ? <Pressable onPress={() => onDeleteItem(item.id)} accessibilityRole='button' accessibilityLabel='حذف عنصر محفوظ'><AppText style={styles.actionDanger}>حذف</AppText></Pressable> : null}</View></View>)}{notes.slice(0, 3).map((note) => <View key={note.id} style={styles.row}><AppText style={styles.smallText}>• ملاحظة ({note.label}): {note.body}</AppText>{onDeleteNote ? <Pressable onPress={() => onDeleteNote(note.id)} accessibilityRole='button' accessibilityLabel='حذف ملاحظة محفوظة'><AppText style={styles.actionDanger}>حذف</AppText></Pressable> : null}</View>)}<DolabSavedMediaGrid media={media.slice(0, 6)} onDeleteMedia={onDeleteMedia} /></>}</AppCard>;
}

const styles = StyleSheet.create({ header: { gap: 3, marginBottom: spacing.xs }, smallText: { fontSize: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, rowActions: { flexDirection: 'row', gap: spacing.sm }, action: { fontSize: 12 }, actionDanger: { fontSize: 12, color: '#B3261E' } });
