import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
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
    <LinearGradient
      colors={['#FFF9F1', '#F5DEC9', '#DDEBE7']}
      locations={[0, 0.58, 1]}
      start={{ x: 0.05, y: 0 }}
      end={{ x: 0.98, y: 1 }}
      style={styles.heroCard}
    >
      <View style={styles.orbPrimary} />
      <View style={styles.orbAccent} />
      <View style={styles.textureLineOne} />
      <View style={styles.textureLineTwo} />

      <View style={styles.topRow}>
        <View style={styles.brandPill}>
          <View style={styles.brandMark}>
            <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
          </View>
          <AppText weight="semibold" style={styles.brandText}>بيتك في تِسوى</AppText>
        </View>

        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="فتح الإشعارات"
            onPress={onOpenNotifications}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressedButton]}
          >
            <Ionicons name="notifications-outline" size={19} color={colors.primary} />
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <AppText weight="bold" style={styles.unreadText}>{unreadCount > 99 ? '99+' : unreadCount}</AppText>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="فتح مركز تِسوى"
            onPress={onOpenHub}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressedButton]}
          >
            <Ionicons name="grid-outline" size={19} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.copyWrap}>
        <AppText weight="bold" style={styles.title}>ابدأ من اللي يهمك</AppText>
        <AppText muted style={styles.subtitle}>فرص جديدة، ردود تنتظرك، وحاجات تستحق تبديلة أحسن.</AppText>
      </View>

      <View style={styles.ctaRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="اعرض حاجة للتبادل"
          onPress={onStartSwap}
          style={({ pressed }) => [styles.primaryCta, pressed && styles.primaryCtaPressed]}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.white} />
          <AppText weight="semibold" style={styles.primaryText}>اعرض حاجة</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="اكتشف الفرص"
          onPress={onDiscover}
          style={({ pressed }) => [styles.secondaryCta, pressed && styles.pressedButton]}
        >
          <Ionicons name="compass-outline" size={18} color={colors.primary} />
          <AppText weight="semibold" style={styles.secondaryText}>اكتشف</AppText>
        </Pressable>
      </View>

      <View style={styles.liveSignal}>
        <View style={styles.liveDotAura}>
          <View style={styles.liveDot} />
        </View>
        <AppText weight="semibold" style={styles.liveSignalText}>عالم تِسوى يتحرك الآن</AppText>
        <View style={styles.liveSignalLine} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    minHeight: 272,
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  orbPrimary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -78,
    left: -58,
    backgroundColor: 'rgba(184,98,63,0.1)',
  },
  orbAccent: {
    position: 'absolute',
    width: 178,
    height: 178,
    borderRadius: 89,
    right: -64,
    bottom: -82,
    backgroundColor: 'rgba(62,124,115,0.13)',
  },
  textureLineOne: {
    position: 'absolute',
    width: 220,
    height: 80,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.1)',
    transform: [{ rotate: '-12deg' }],
    right: -86,
    top: 96,
  },
  textureLineTwo: {
    position: 'absolute',
    width: 160,
    height: 58,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(62,124,115,0.1)',
    transform: [{ rotate: '14deg' }],
    left: -72,
    bottom: 52,
  },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  brandPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.round,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,253,248,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
  },
  brandMark: { width: 26, height: 26, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  brandText: { color: colors.primary, fontSize: 12 },
  topActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.17)',
  },
  pressedButton: { opacity: 0.76, transform: [{ scale: 0.97 }] },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: '#F9EBDD',
  },
  unreadText: { color: colors.white, fontSize: 9 },
  copyWrap: { maxWidth: 315, gap: spacing.xs },
  title: { fontSize: 29, lineHeight: 37 },
  subtitle: { fontSize: 15, lineHeight: 23, color: '#5F5348' },
  ctaRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  primaryCta: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  primaryCtaPressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  primaryText: { color: colors.white, fontSize: 14 },
  secondaryCta: {
    minWidth: 118,
    minHeight: 46,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,253,248,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.22)',
    paddingHorizontal: spacing.md,
  },
  secondaryText: { color: colors.primary, fontSize: 14 },
  liveSignal: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, marginTop: 'auto' },
  liveDotAura: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(62,124,115,0.13)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  liveSignalText: { color: colors.accent, fontSize: 11 },
  liveSignalLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(62,124,115,0.18)' },
});
