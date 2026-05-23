import { StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { spacing } from '@/constants/spacing';

export function AppLoadingState({ label = 'جاري التحميل...' }: { label?: string }) {
  return <AppFadeIn style={styles.wrap}><AppText muted>{label}</AppText></AppFadeIn>;
}

const styles = StyleSheet.create({ wrap: { paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center' } });
