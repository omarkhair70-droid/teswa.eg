import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <View style={styles.box}><AppText weight="semibold">{title}</AppText><AppText muted>{description}</AppText></View>;
}
const styles = StyleSheet.create({ box: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm } });
