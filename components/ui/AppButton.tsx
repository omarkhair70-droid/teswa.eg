import { Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function AppButton({ label, onPress, variant = 'primary' }: { label: string; onPress?: () => void; variant?: 'primary' | 'neutral' }) {
  return <Pressable style={[styles.base, variant === 'neutral' && styles.neutral]} onPress={onPress}><AppText weight="semibold" style={variant === 'neutral' ? styles.neutralText : styles.primaryText}>{label}</AppText></Pressable>;
}
const styles = StyleSheet.create({ base: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center' }, neutral: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, primaryText: { color: colors.white }, neutralText: { color: colors.text } });
