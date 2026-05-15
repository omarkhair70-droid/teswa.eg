import { I18nManager, StyleSheet, TextInput, TextInputProps } from 'react-native';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function AppInput(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textMuted} style={styles.input} textAlign={I18nManager.isRTL ? 'right' : 'left'} {...props} />;
}
const styles = StyleSheet.create({ input: { backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text } });
