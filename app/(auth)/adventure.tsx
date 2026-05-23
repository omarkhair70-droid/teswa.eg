import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { getAdventureMuted, setAdventureEntranceSeen, setAdventureMuted } from '@/lib/adventure-entrance';

const items = [
  { icon: 'swap-horizontal', x: 22, y: 32 }, { icon: 'pricetag', x: 78, y: 36 }, { icon: 'star', x: 12, y: 54 },
  { icon: 'card', x: 82, y: 57 }, { icon: 'phone-portrait', x: 20, y: 72 }, { icon: 'bag-handle', x: 76, y: 72 },
  { icon: 'gift', x: 50, y: 22 }, { icon: 'albums', x: 48, y: 76 },
] as const;

export default function AdventureScreen() {
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const particles = useMemo(() => items.map(() => new Animated.Value(0)), []);
  const logo = useRef(new Animated.Value(0)).current;
  const copy = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => { void getAdventureMuted().then(setMuted).catch(() => setMuted(true)); }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logo, { toValue: 1, duration: 520, useNativeDriver: true, easing: Easing.out(Easing.back(1.3)) }),
      Animated.timing(copy, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();

    particles.forEach((value, index) => {
      const duration = 3000 + (index * 180);
      Animated.loop(Animated.sequence([
        Animated.timing(value, { toValue: 1, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(value, { toValue: 0, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ])).start();
    });
  }, [copy, logo, particles]);

  const playSound = async (name: string, force = false) => {
    if (!force && muted) return;
    try {
      const audio = await import('expo-audio') as Record<string, any>;
      const create = audio.createAudioPlayer;
      if (!create) return;
      const map: Record<string, any> = {
        tap: require('@/assets/sounds/teswa-tap-soft.mp3'),
        logo: require('@/assets/sounds/teswa-logo-chime.mp3'),
        swish: require('@/assets/sounds/teswa-transition-swish.mp3'),
      };
      const player = create(map[name]);
      if (player?.play) player.play();
    } catch {}
  };

  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    await setAdventureEntranceSeen(true).catch(() => undefined);
    await playSound('tap');
    await playSound('swish');
    Animated.timing(reveal, { toValue: 1, duration: 420, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start(() => {
      router.replace('/(auth)/login');
    });
  };

  const onSkip = async () => {
    if (busy) return;
    setBusy(true);
    await setAdventureEntranceSeen(true).catch(() => undefined);
    router.replace('/(auth)/login');
  };

  const onMuteToggle = async () => {
    const next = !muted;
    setMuted(next);
    await setAdventureMuted(next).catch(() => undefined);
    if (!next) await playSound('logo', true);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1B1E3D', '#263D5C', '#3E7C73']} style={StyleSheet.absoluteFill} />
      <View style={styles.skyline} />
      {items.map((item, i) => (
        <Animated.View key={`${item.icon}-${i}`} style={[styles.item, { left: `${item.x}%`, top: `${item.y}%`, transform: [{ translateY: particles[i].interpolate({ inputRange: [0, 1], outputRange: [-6, 6] }) }] }]}>
          <Ionicons name={item.icon as any} size={22} color="rgba(255,255,255,0.9)" />
        </Animated.View>
      ))}
      <Animated.View style={[styles.logoWrap, { opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }] }]}>
        <View style={styles.logoGlow} />
        <AppText style={styles.logo}>تِسوى</AppText>
      </Animated.View>
      <Animated.View style={{ opacity: copy, transform: [{ translateY: copy.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <AppText style={styles.title}>بدّل. اكسب. اكتشف.</AppText>
        <AppText style={styles.subtitle}>كل حاجة ليها فرصة تانية.</AppText>
      </Animated.View>
      <View style={styles.controls}>
        <Pressable style={styles.primary} onPress={onStart}><AppText style={styles.primaryText}>ابدأ المغامرة</AppText></Pressable>
        <Pressable style={styles.secondary} onPress={onSkip}><AppText style={styles.secondaryText}>تخطي</AppText></Pressable>
      </View>
      <Pressable style={styles.mute} onPress={onMuteToggle}><Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" /></Pressable>
      <Animated.View pointerEvents="none" style={[styles.portal, { opacity: reveal }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  skyline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 170, backgroundColor: 'rgba(12,22,44,0.35)', borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  item: { position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  logoWrap: { alignItems: 'center', marginBottom: spacing.lg },
  logoGlow: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,210,110,0.18)' },
  logo: { fontSize: 48, color: '#fff', fontWeight: '800', marginTop: 40 },
  title: { fontSize: 32, lineHeight: 42, textAlign: 'center', color: '#fff', fontWeight: '700' },
  subtitle: { fontSize: 20, lineHeight: 30, textAlign: 'center', color: 'rgba(255,255,255,0.9)', marginTop: spacing.sm },
  controls: { width: '100%', marginTop: spacing.xl, gap: spacing.md },
  primary: { backgroundColor: '#F6A15B', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#1B1E3D', fontSize: 18, fontWeight: '800' },
  secondary: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  mute: { position: 'absolute', top: 58, right: 24, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  portal: { ...StyleSheet.absoluteFillObject, backgroundColor: '#F6A15B' },
});
