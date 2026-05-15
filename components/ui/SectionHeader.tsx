import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { spacing } from '@/constants/spacing';

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.wrap}><AppText weight="bold" style={styles.title}>{title}</AppText>{subtitle ? <AppText muted>{subtitle}</AppText> : null}</View>;
}
const styles = StyleSheet.create({ wrap: { gap: spacing.xs }, title: { fontSize: 22 } });
