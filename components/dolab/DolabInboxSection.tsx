import { Pressable, StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabInboxItem } from '@/lib/dolab/inbox';
import { formatInboxSourceLabel, formatInboxTypeLabel } from '@/lib/dolab/inbox';

type Props = {
  items: DolabInboxItem[];
  onConvertToNote: (item: DolabInboxItem) => void;
  onConvertToMedia: (item: DolabInboxItem) => void;
  onStartDraft: (item: DolabInboxItem) => void;
  onDelete: (id: string) => void;
};

const dateLabel = (createdAt: string) => {
  const delta = Date.now() - new Date(createdAt).getTime();
  return delta < 1000 * 60 * 2 ? 'الآن' : 'من شوية';
};

const resolveTypeLabel = (item: DolabInboxItem) => {
  if (item.type === 'file' && item.mimeType?.toLowerCase().startsWith('audio/')) return 'تسجيل صوتي';
  return formatInboxTypeLabel(item.type);
};

export function DolabInboxSection({ items, onConvertToNote, onConvertToMedia, onStartDraft, onDelete }: Props) {
  return (
    <AppCard>
      <View style={styles.listWrap}>
        {items.map((item) => {
          const emphasizeMedia = item.type === 'image' || item.type === 'video' || item.mimeType?.toLowerCase().startsWith('audio/');
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.row}>
                <View style={styles.badge}>
                  <AppText style={styles.badgeText}>{resolveTypeLabel(item)}</AppText>
                </View>
                <AppText muted style={styles.metaText}>
                  {formatInboxSourceLabel(item.source)} · {dateLabel(item.createdAt)}
                </AppText>
              </View>
              <AppText weight="semibold">{item.title}</AppText>
              {item.body ? <AppText muted numberOfLines={2}>{item.body}</AppText> : null}
              <View style={styles.actionsRow}>
                <Pressable style={emphasizeMedia ? styles.actionBtn : styles.actionBtnPrimary} onPress={() => onConvertToNote(item)} accessibilityRole="button" accessibilityLabel="حوّل الوارد لنوت">
                  <AppText style={emphasizeMedia ? styles.actionText : styles.actionTextPrimary}>حوّل لنوت</AppText>
                </Pressable>
                <Pressable style={emphasizeMedia ? styles.actionBtnPrimary : styles.actionBtn} onPress={() => onConvertToMedia(item)} accessibilityRole="button" accessibilityLabel="حوّل الوارد لميديا">
                  <AppText style={emphasizeMedia ? styles.actionTextPrimary : styles.actionText}>حوّل لميديا</AppText>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => onStartDraft(item)} accessibilityRole="button" accessibilityLabel="ابدأ مسودة من الوارد">
                  <AppText style={styles.actionText}>ابدأ مسودة</AppText>
                </Pressable>
                <Pressable style={styles.actionBtnDanger} onPress={() => onDelete(item.id)} accessibilityRole="button" accessibilityLabel="احذف الوارد">
                  <AppText style={styles.actionTextDanger}>احذف</AppText>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  listWrap: {
    gap: spacing.sm,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 12,
  },
  metaText: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionText: {
    color: colors.primary,
    fontSize: 12,
  },
  actionTextPrimary: {
    color: colors.white,
    fontSize: 12,
  },
  actionBtnDanger: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionTextDanger: {
    color: colors.danger,
    fontSize: 12,
  },
});
