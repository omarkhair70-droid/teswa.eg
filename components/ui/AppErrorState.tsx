import { StyleSheet } from 'react-native';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { spacing } from '@/constants/spacing';

export function AppErrorState({ title = 'حدث خطأ', description, retryLabel = 'إعادة المحاولة', onRetry }: { title?: string; description?: string; retryLabel?: string; onRetry?: () => void }) {
  return (
    <AppFadeIn style={styles.wrap}>
      <AppText weight="semibold">{title}</AppText>
      {description ? <AppText muted>{description}</AppText> : null}
      {onRetry ? <AppButton label={retryLabel} onPress={onRetry} variant="neutral" size="sm" /> : null}
    </AppFadeIn>
  );
}

const styles = StyleSheet.create({ wrap: { paddingVertical: spacing.lg, gap: spacing.sm, alignItems: 'center' } });
