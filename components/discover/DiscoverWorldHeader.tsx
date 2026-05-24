import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function DiscoverWorldHeader() {
  return (
    <LinearGradient colors={['#FFF8EF', '#FFE4C4', 'rgba(62,124,115,0.18)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wrap}>
      <View style={styles.badge}><Ionicons name="compass-outline" size={16} color={colors.primary} /><AppText weight="semibold">بوابة الاكتشاف</AppText></View>
      <AppText weight="bold" style={styles.title}>اكتشف عالم تسوى</AppText>
      <AppText muted>سطح استكشاف حيّ يجمع الناس، الحركة، والعناصر بإيقاع واضح وهادئ.</AppText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', gap: spacing.xs },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.66)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)' },
  title: { fontSize: 24 },
});
