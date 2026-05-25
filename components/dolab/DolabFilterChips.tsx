import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabSortMode, DolabStatusFilter } from '@/lib/dolab/organization';

const SORTS: Array<{ key: DolabSortMode; label: string }> = [
  { key: 'newest', label: 'الأحدث' },
  { key: 'oldest', label: 'الأقدم' },
  { key: 'ready', label: 'الأكثر جاهزية' },
];
const FILTERS: Array<{ key: DolabStatusFilter; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'saved', label: 'محفوظ' },
  { key: 'temporary', label: 'مؤقت' },
  { key: 'failed', label: 'فشل' },
  { key: 'published', label: 'منشور' },
];

export function DolabFilterChips(props: { sort: DolabSortMode; status: DolabStatusFilter; onSortChange: (value: DolabSortMode) => void; onStatusChange: (value: DolabStatusFilter) => void }) {
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {SORTS.map((item) => <Chip key={item.key} label={item.label} active={props.sort === item.key} onPress={() => props.onSortChange(item.key)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {FILTERS.map((item) => <Chip key={item.key} label={item.label} active={props.status === item.key} onPress={() => props.onStatusChange(item.key)} />)}
      </ScrollView>
    </>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable style={[styles.chip, active && styles.active]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`فلتر ${label}`}><AppText style={[styles.text, active && styles.textActive]}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({ row: { gap: spacing.xs, paddingVertical: spacing.xs }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }, active: { backgroundColor: colors.primary, borderColor: colors.primary }, text: { fontSize: 12 }, textActive: { color: colors.onPrimary } });
