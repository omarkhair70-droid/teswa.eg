import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export function DolabVaultHero() {
  const glow = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );
    const ringLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 2800, useNativeDriver: true }),
      ]),
    );
    glowLoop.start();
    ringLoop.start();
    return () => {
      glowLoop.stop();
      ringLoop.stop();
      glow.stopAnimation();
      ring.stopAnimation();
    };
  }, [glow, ring]);

  return (
    <LinearGradient colors={['#FFF8EE', '#F4EDE4', '#F2F7F6']} style={styles.hero}>
      <Animated.View style={[styles.heroGlow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }) }]} />
      <Animated.View style={[styles.ring, { opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.36] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }] }]} />

      <View style={styles.heroTopRow}>
        <View style={styles.heroTopIcon}><Ionicons name="archive-outline" size={22} color={colors.primary} /></View>
        <View style={styles.heroBadge}><Ionicons name="shield-checkmark-outline" size={13} color={colors.accent} /><AppText weight="semibold" style={styles.heroBadgeText}>مساحتك الخاصة</AppText></View>
      </View>

      <View style={styles.copy}>
        <AppText muted style={styles.eyebrow}>خزنتك داخل تِسوى</AppText>
        <AppText weight="bold" style={styles.heroTitle}>دولاب تِسوى</AppText>
        <AppText muted style={styles.heroSubtitle}>اجمع الصور والفيديوهات والأفكار والمسودات في مكان واحد، وبعدها حوّل اللي يستاهل لإعلان أو شاركه في المحادثة.</AppText>
      </View>

      <View style={styles.capabilities}>
        <View style={styles.capability}><Ionicons name="images-outline" size={13} color={colors.textMuted} /><AppText style={styles.capabilityText}>ميديا</AppText></View>
        <View style={styles.capability}><Ionicons name="chatbox-ellipses-outline" size={13} color={colors.textMuted} /><AppText style={styles.capabilityText}>أفكار</AppText></View>
        <View style={styles.capability}><Ionicons name="swap-horizontal-outline" size={13} color={colors.textMuted} /><AppText style={styles.capabilityText}>للتبديل</AppText></View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)', padding: spacing.lg, overflow: 'hidden', gap: spacing.lg },
  heroGlow: { position: 'absolute', width: 170, height: 170, borderRadius: radii.round, backgroundColor: 'rgba(184,98,63,0.22)', left: -30, top: -20 },
  ring: { position: 'absolute', width: 220, height: 220, borderRadius: radii.round, borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', right: -70, top: -80 },
  heroTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  heroTopIcon: { width: 44, height: 44, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.9)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)' },
  heroBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: radii.round, backgroundColor: 'rgba(255,253,248,0.92)', borderWidth: 1, borderColor: 'rgba(62,124,115,0.18)', paddingHorizontal: spacing.sm, paddingVertical: 5 },
  heroBadgeText: { color: colors.accent, fontSize: 10 },
  copy: { alignItems: 'flex-end', gap: 4 },
  eyebrow: { fontSize: 11 },
  heroTitle: { fontSize: 28, textAlign: 'right' },
  heroSubtitle: { lineHeight: 22, textAlign: 'right' },
  capabilities: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  capability: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: 'rgba(255,255,255,0.68)' },
  capabilityText: { fontSize: 10, color: colors.textMuted },
});
