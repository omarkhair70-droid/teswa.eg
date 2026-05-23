import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { spacing } from '@/constants/spacing';

export function AppLoadingState({ label = 'جاري التحميل...' }: { label?: string }) {
  return <View style={styles.wrap}><AppText muted>{label}</AppText></View>;
}

const styles = StyleSheet.create({ wrap: { paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center' } });
