import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export function DolabCollectionBadge({ name }: { name: string }) {
  return <View style={styles.badge}><AppText style={styles.text}>مجموعة: {name}</AppText></View>;
}
const styles = StyleSheet.create({ badge: { backgroundColor: colors.primary + '20', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' }, text: { color: colors.primary, fontSize: 12 } });
