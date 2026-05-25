import { Pressable, StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { DolabSmartGroup } from '@/lib/dolab/collections';

export function DolabSmartGroupsSection({ groups, onPressGroup }: { groups: DolabSmartGroup[]; onPressGroup: (group: DolabSmartGroup) => void }) {
  const hasItems = groups.some((group) => group.count > 0);

  return (
    <AppCard>
      <View style={styles.header}>
        <AppText weight="bold">مجموعات ذكية</AppText>
        <AppText muted>الدولاب بيرتبلك اللي محتاج انتباه.</AppText>
      </View>
      {!hasItems ? (
        <AppText muted>كل حاجة مترتبة حاليًا.</AppText>
      ) : (
        <View style={styles.wrap}>
          {groups.map((group) => (
            <Pressable key={group.id} style={styles.chip} onPress={() => onPressGroup(group)} accessibilityRole="button" accessibilityLabel={`فتح مجموعة ذكية ${group.title}`}>
              <View style={styles.row}><AppText weight="semibold">{group.title}</AppText><AppText style={styles.count}>{group.count}</AppText></View>
              <AppText muted style={styles.small}>{group.description}</AppText>
            </Pressable>
          ))}
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({ header: { gap: 4, marginBottom: spacing.sm }, wrap: { gap: spacing.sm }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm, gap: 4 }, row: { flexDirection: 'row', justifyContent: 'space-between' }, count: { color: colors.primary }, small: { fontSize: 12 } });
