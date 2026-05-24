import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function HomeLivingWorldHero({
  onOpenHub,
  onOpenNotifications,
  onStartSwap,
  onDiscover,
  unreadCount,
}: {
  onOpenHub: () => void;
  onOpenNotifications: () => void;
  onStartSwap: () => void;
  onDiscover: () => void;
  unreadCount: number;
}) {
  return (
    <LinearGradient colors={['#FFF9F0', '#F8E1CD', '#FFF2E2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
      <View style={[styles.orb, styles.orbTop]} />
      <View style={[styles.orb, styles.orbBottom]} />
      <View style={styles.topRow}>
        <Pressable style={styles.topIcon} onPress={onOpenNotifications}>
          <Ionicons name="notifications-outline" size={17} color={colors.primary} />
          {unreadCount > 0 ? (
            <View style={styles.unreadBadge}><AppText style={styles.unreadText} weight="bold">{unreadCount > 99 ? '99+' : unreadCount}</AppText></View>
          ) : null}
        </Pressable>
        <Pressable style={styles.topIcon} onPress={onOpenHub}>
          <Ionicons name="compass-outline" size={17} color={colors.primary} />
        </Pressable>
      </View>
      <AppText weight="bold" style={styles.title}>عالم تسوى صاحي</AppText>
      <AppText style={styles.subtitle}>فرص جديدة، عناصر بتتحرك، وحكايات بتبدأ من هنا.</AppText>
      <View style={styles.ctaRow}>
        <Pressable style={styles.primaryCta} onPress={onStartSwap}><AppText weight="semibold" style={styles.primaryText}>ابدأ تبادل</AppText></Pressable>
        <Pressable style={styles.secondaryCta} onPress={onDiscover}><AppText weight="semibold" style={styles.secondaryText}>اكتشف الفرص</AppText></Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  heroCard: { minHeight: 188, borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(184,98,63,0.24)', padding: spacing.md, overflow: 'hidden', gap: spacing.sm },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.4)' },
  orbTop: { width: 120, height: 120, top: -24, right: -20 },
  orbBottom: { width: 150, height: 150, bottom: -70, left: -40, backgroundColor: 'rgba(250,221,185,0.52)' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  topIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', backgroundColor: 'rgba(255,255,255,0.75)' },
  unreadBadge: { position: 'absolute', top: -5, left: -5, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, backgroundColor: colors.primary },
  unreadText: { color: '#fff', fontSize: 10 },
  title: { fontSize: 28 },
  subtitle: { lineHeight: 22 },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  primaryCta: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, paddingVertical: spacing.sm, backgroundColor: colors.primary },
  primaryText: { color: '#fff' },
  secondaryCta: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(184,98,63,0.3)', backgroundColor: 'rgba(255,255,255,0.7)' },
  secondaryText: { color: colors.primary },
});
