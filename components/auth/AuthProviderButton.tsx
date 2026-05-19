import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

type AuthProviderButtonProps = {
  label: string;
  loadingLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function AuthProviderButton({ label, loadingLabel, loading = false, disabled = false, onPress }: AuthProviderButtonProps) {
  return (
    <Pressable style={[styles.button, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <View style={styles.iconWrap}><Ionicons name="logo-google" size={18} color="#DB4437" /></View>
      <AppText weight="semibold" style={styles.text}>{loading ? loadingLabel : label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: '#E7DED4', backgroundColor: '#FFFDFC', paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  iconWrap: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.text },
  disabled: { opacity: 0.6 },
});
