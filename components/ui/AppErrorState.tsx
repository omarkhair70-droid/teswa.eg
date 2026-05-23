import { StyleSheet, View } from 'react-native';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { spacing } from '@/constants/spacing';

export function AppErrorState({ title = 'حدث خطأ', description, retryLabel = 'إعادة المحاولة', onRetry }: { title?: string; description?: string; retryLabel?: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap}>
      <AppText weight="semibold">{title}</AppText>
      {description ? <AppText muted>{description}</AppText> : null}
      {onRetry ? <AppButton label={retryLabel} onPress={onRetry} variant="neutral" size="sm" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { paddingVertical: spacing.lg, gap: spacing.sm, alignItems: 'center' } });
