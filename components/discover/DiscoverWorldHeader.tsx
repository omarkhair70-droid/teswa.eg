import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function DiscoverWorldHeader() {
  return (
    <LinearGradient colors={['#FFF9F1', '#FBE8D2', 'rgba(62,124,115,0.12)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wrap}>
      <View style={styles.badge}><Ionicons name="compass-outline" size={15} color={colors.primary} /><AppText weight="semibold">بوابة الاكتشاف</AppText></View>
      <View style={styles.pathRow}>
        <View style={styles.pathLine} />
        <View style={styles.portalDot}>
          <Ionicons name="navigate-outline" size={10} color={colors.primary} />
        </View>
      </View>
      <AppText weight="bold" style={styles.title}>اكتشف عالم تسوى</AppText>
      <AppText muted>واجهة أهدأ على نفس لغة عالم تِسوى، توريك الناس والعناصر والحركة بوضوح.</AppText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', gap: spacing.xs },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)' },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  pathLine: { flex: 1, height: 2, borderRadius: radii.round, backgroundColor: 'rgba(184,98,63,0.18)' },
  portalDot: { width: 20, height: 20, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', backgroundColor: 'rgba(255,255,255,0.58)' },
  title: { fontSize: 23 },
});
