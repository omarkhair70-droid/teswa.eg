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
  const drift = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 3200, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 3200, useNativeDriver: true }),
      ]),
    );

    const ringLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: 2800, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 0, duration: 2800, useNativeDriver: true }),
      ]),
    );

    glowLoop.start();
    driftLoop.start();
    ringLoop.start();

    return () => {
      glowLoop.stop();
      driftLoop.stop();
      ringLoop.stop();
      glow.stopAnimation();
      drift.stopAnimation();
      ring.stopAnimation();
    };
  }, [drift, glow, ring]);

  return (
    <LinearGradient colors={['#FFF8EE', '#F4EDE4', '#F2F7F6']} style={styles.hero}>
      <Animated.View
        style={[
          styles.heroGlow,
          {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.36] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.floatingChip,
          {
            transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
          },
        ]}
      >
        <Ionicons name="lock-closed-outline" size={14} color={colors.primary} />
        <AppText style={styles.chipText}>خاص</AppText>
      </Animated.View>
      <Animated.View
        style={[
          styles.floatingChipSecondary,
          {
            transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-2, 6] }) }],
          },
        ]}
      >
        <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
        <AppText style={styles.chipText}>حيّ</AppText>
      </Animated.View>
      <View style={styles.heroTopIcon}>
        <Ionicons name="archive-outline" size={22} color={colors.primary} />
      </View>
      <View style={styles.heroBadge}>
        <AppText weight="semibold" style={styles.heroBadgeText}>
          نسخة أولى
        </AppText>
      </View>
      <AppText weight="bold" style={styles.heroTitle}>
        دولاب تسوى
      </AppText>
      <AppText muted style={styles.heroSubtitle}>
        مكانك الخاص لتجميع الصور، الفيديوهات، الأفكار، والحاجات اللي ممكن تتحول لتبادل.
      </AppText>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
    padding: spacing.lg,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  heroGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: radii.round,
    backgroundColor: 'rgba(184,98,63,0.22)',
    left: -30,
    top: -20,
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    right: -70,
    top: -80,
  },
  heroTopIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,248,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,253,248,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.22)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heroBadgeText: {
    color: '#7B5230',
    fontSize: 12,
  },
  heroTitle: {
    fontSize: 28,
  },
  heroSubtitle: {
    lineHeight: 23,
  },
  floatingChip: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row-reverse',
    gap: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.round,
  },
  floatingChipSecondary: {
    position: 'absolute',
    bottom: 18,
    left: 14,
    flexDirection: 'row-reverse',
    gap: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.round,
  },
  chipText: {
    fontSize: 12,
  },
});
