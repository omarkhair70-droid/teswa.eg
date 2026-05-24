import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
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
  const portalPulse = useRef(new Animated.Value(0)).current;
  const orbDrift = useRef(new Animated.Value(0)).current;
  const chipFloats = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(portalPulse, { toValue: 1, duration: 3600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(portalPulse, { toValue: 0, duration: 3600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbDrift, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(orbDrift, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      ...chipFloats.map((chip, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(chip, {
              toValue: 1,
              duration: 3200 + index * 460,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(chip, {
              toValue: 0,
              duration: 3000 + index * 420,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    ];

    loopsRef.current = loops;
    loops.forEach((loop) => loop.start());
    return () => {
      loopsRef.current.forEach((loop) => loop.stop());
      loopsRef.current = [];
    };
  }, [chipFloats, orbDrift, portalPulse]);

  const chipStyles = useMemo(
    () =>
      chipFloats.map((chip) => ({
        transform: [{ translateY: chip.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
        opacity: chip.interpolate({ inputRange: [0, 1], outputRange: [0.65, 0.95] }),
      })),
    [chipFloats],
  );

  return (
    <LinearGradient colors={['#FFF9F0', '#F6DEC3', '#FCEBDA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
      <Animated.View
        style={[
          styles.heroOrb,
          styles.heroOrbMain,
          { transform: [{ translateX: orbDrift.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) }] },
        ]}
      />
      <Animated.View
        style={[
          styles.heroOrb,
          styles.heroOrbAccent,
          { transform: [{ translateY: orbDrift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] },
        ]}
      />

      <View style={styles.sceneryLayer}>
        <View style={styles.skylineRow}>
          <View style={[styles.skylineBlock, styles.skylineTall]} />
          <View style={[styles.skylineBlock, styles.skylineMid]} />
          <View style={[styles.skylineBlock, styles.skylineWide]} />
          <View style={styles.skylineBlock} />
          <View style={[styles.skylineBlock, styles.skylineTall]} />
        </View>
        <Animated.View
          style={[
            styles.portalPath,
            {
              opacity: portalPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.72] }),
              transform: [{ scaleX: portalPulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.portalGlow,
            { opacity: portalPulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.45] }) },
          ]}
        />

        <Animated.View style={[styles.floatingChip, styles.chipA, chipStyles[0]]}><Ionicons name="swap-horizontal" size={12} color={colors.primary} /></Animated.View>
        <Animated.View style={[styles.floatingChip, styles.chipB, chipStyles[1]]}><Ionicons name="pricetag-outline" size={12} color={colors.primary} /></Animated.View>
        <Animated.View style={[styles.floatingChip, styles.chipC, chipStyles[2]]}><Ionicons name="bag-handle-outline" size={12} color={colors.primary} /></Animated.View>
        <Animated.View style={[styles.floatingChip, styles.chipD, chipStyles[3]]}><Ionicons name="sparkles-outline" size={12} color={colors.primary} /></Animated.View>
      </View>

      <View style={styles.safeCopyLayer}>
        <View style={styles.topRow}>
          <Pressable style={styles.iconButton} onPress={onOpenNotifications} accessibilityRole="button" accessibilityLabel="فتح الإشعارات">
            <Ionicons name="notifications-outline" size={18} color={colors.primary} />
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}><AppText style={styles.unreadText} weight="bold">{unreadCount > 99 ? '99+' : unreadCount}</AppText></View>
            ) : null}
          </Pressable>
          <Pressable style={styles.hubTrigger} onPress={onOpenHub} accessibilityRole="button" accessibilityLabel="فتح مركز تسوى">
            <View style={styles.menuGlyph}><View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLine} /></View>
            <AppText weight="semibold" style={styles.hubTriggerText}>مركز تسوى</AppText>
          </Pressable>
        </View>

        <View style={styles.copyWrap}>
          <AppText weight="bold" style={styles.title}>عالم تسوى صاحي</AppText>
          <AppText style={styles.subtitle}>فرص جديدة، عناصر بتتحرك، وحكايات بتبدأ من هنا.</AppText>
        </View>

        <View style={styles.ctaRow}>
          <Pressable style={styles.primaryCta} onPress={onStartSwap} accessibilityRole="button" accessibilityLabel="ابدأ تبادل"><AppText weight="semibold" style={styles.primaryText}>ابدأ تبادل</AppText></Pressable>
          <Pressable style={styles.secondaryCta} onPress={onDiscover} accessibilityRole="button" accessibilityLabel="اكتشف الفرص"><AppText weight="semibold" style={styles.secondaryText}>اكتشف الفرص</AppText></Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  heroCard: { minHeight: 236, borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(184,98,63,0.24)', padding: spacing.md, overflow: 'hidden' },
  sceneryLayer: { ...StyleSheet.absoluteFillObject },
  heroOrb: { position: 'absolute', borderRadius: 999 },
  heroOrbMain: { width: 148, height: 148, right: -44, top: -30, backgroundColor: 'rgba(255,248,234,0.8)' },
  heroOrbAccent: { width: 170, height: 170, left: -56, bottom: -72, backgroundColor: 'rgba(216,170,126,0.35)' },
  skylineRow: { position: 'absolute', left: 22, right: 22, bottom: 70, flexDirection: 'row', alignItems: 'flex-end', gap: 6, opacity: 0.38 },
  skylineBlock: { height: 10, flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: 'rgba(138,90,45,0.35)' },
  skylineTall: { height: 18 },
  skylineMid: { height: 13 },
  skylineWide: { flex: 1.5 },
  portalPath: { position: 'absolute', left: '23%', right: '23%', bottom: 44, height: 38, borderWidth: 1.1, borderColor: 'rgba(184,98,63,0.35)', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  portalGlow: { position: 'absolute', width: 184, height: 72, borderRadius: 999, bottom: 26, alignSelf: 'center', backgroundColor: 'rgba(250,206,160,0.34)' },
  floatingChip: { position: 'absolute', width: 28, height: 28, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(184,98,63,0.22)', backgroundColor: 'rgba(255,255,255,0.8)' },
  chipA: { right: 24, top: 104 },
  chipB: { right: 96, top: 142 },
  chipC: { left: 40, top: 116 },
  chipD: { left: 12, top: 150 },
  safeCopyLayer: { flex: 1, gap: spacing.sm, zIndex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconButton: { width: 36, height: 36, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', backgroundColor: 'rgba(255,255,255,0.77)' },
  hubTrigger: { minHeight: 38, paddingHorizontal: spacing.sm, borderRadius: radii.round, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: 'rgba(184,98,63,0.25)', backgroundColor: 'rgba(255,255,255,0.85)' },
  menuGlyph: { gap: 2 },
  menuLine: { width: 13, height: 2, borderRadius: 2, backgroundColor: colors.primary },
  hubTriggerText: { color: colors.primary, fontSize: 13 },
  unreadBadge: { position: 'absolute', top: -5, left: -5, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, backgroundColor: colors.primary },
  unreadText: { color: '#fff', fontSize: 10 },
  copyWrap: { maxWidth: '72%', gap: spacing.xs, backgroundColor: 'rgba(255,252,247,0.8)', borderRadius: radii.md, padding: spacing.sm },
  title: { fontSize: 28 },
  subtitle: { lineHeight: 22 },
  ctaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 'auto' },
  primaryCta: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.round, paddingVertical: spacing.sm, backgroundColor: colors.primary },
  primaryText: { color: '#fff' },
  secondaryCta: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.round, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(184,98,63,0.3)', backgroundColor: 'rgba(255,255,255,0.74)' },
  secondaryText: { color: colors.primary },
});
