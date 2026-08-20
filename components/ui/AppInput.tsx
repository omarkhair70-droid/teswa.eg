import { I18nManager, TextInput, type TextInputProps } from 'react-native';

import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

const createStyles = (colors: TeswaThemeColors) => ({
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
});

export function AppInput(props: TextInputProps) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  return <TextInput placeholderTextColor={colors.textMuted} style={styles.input} textAlign={I18nManager.isRTL ? 'right' : 'left'} {...props} />;
}
