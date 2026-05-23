import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { spacing } from '@/constants/spacing';
import { getAdventureMuted, setAdventureEntranceSeen, setAdventureMuted } from '@/lib/adventure-entrance';

type FloatingItem = { icon: keyof typeof Ionicons.glyphMap; x: number; y: number; size: number };

const floatingItems: FloatingItem[] = [
  { icon: 'swap-horizontal', x: 14, y: 34, size: 20 },
  { icon: 'pricetag', x: 80, y: 35, size: 19 },
  { icon: 'star', x: 8, y: 54, size: 18 },
  { icon: 'card', x: 84, y: 55, size: 20 },
  { icon: 'phone-portrait', x: 16, y: 73, size: 18 },
  { icon: 'bag-handle', x: 78, y: 73, size: 19 },
  { icon: 'gift', x: 49, y: 23, size: 20 },
  { icon: 'albums', x: 49, y: 75, size: 18 },
];

export default function AdventureScreen() {
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);

  const logoIn = useRef(new Animated.Value(0)).current;
  const copyIn = useRef(new Animated.Value(0)).current;
  const tinyCopyIn = useRef(new Animated.Value(0)).current;
  const ctaIn = useRef(new Animated.Value(0)).current;
  const portal = useRef(new Animated.Value(0)).current;
  const ctaPress = useRef(new Animated.Value(0)).current;
  const softLight = useRef(new Animated.Value(0)).current;
  const roadPulse = useRef(new Animated.Value(0)).current;

  const itemFloat = useMemo(() => floatingItems.map(() => new Animated.Value(0)), []);
  const itemCenterPull = useMemo(() => floatingItems.map(() => new Animated.Value(0)), []);

  useEffect(() => {
    void getAdventureMuted().then(setMuted).catch(() => setMuted(false));
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoIn, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.stagger(90, [
        Animated.timing(copyIn, { toValue: 1, duration: 340, useNativeDriver: true }),
        Animated.timing(tinyCopyIn, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(ctaIn, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();

    const loops: Animated.CompositeAnimation[] = [];

    const lightLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(softLight, { toValue: 1, duration: 3400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(softLight, { toValue: 0, duration: 3400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loops.push(lightLoop);
    lightLoop.start();

    const roadLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(roadPulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(roadPulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loops.push(roadLoop);
    roadLoop.start();

    itemFloat.forEach((value, index) => {
      const duration = 2600 + index * 210;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      loops.push(loop);
      loop.start();
    });

    return () => loops.forEach((loop) => loop.stop());
  }, [copyIn, ctaIn, itemFloat, logoIn, roadPulse, softLight, tinyCopyIn]);

  const playSound = async (name: 'tap' | 'logo' | 'swish') => {
    if (muted) return;
    try {
      const audio = (await import('expo-audio')) as Record<string, any>;
      const create = audio.createAudioPlayer;
      if (!create) return;
      const map = {
        tap: require('../../assets/sounds/teswa-tap-soft.mp3'),
        logo: require('../../assets/sounds/teswa-logo-chime.mp3'),
        swish: require('../../assets/sounds/teswa-transition-swish.mp3'),
      };
      const player = create(map[name]);
      player?.play?.();
    } catch {}
  };

  const onStart = async () => {
    if (busy) return;
    setBusy(true);
    await setAdventureEntranceSeen(true).catch(() => undefined);
    Animated.spring(ctaPress, { toValue: 1, useNativeDriver: true, friction: 7, tension: 120 }).start();

    await playSound('tap');
    await playSound('logo');

    Animated.parallel([
      Animated.timing(portal, { toValue: 1, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(
        20,
        itemCenterPull.map((value) => Animated.timing(value, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true })),
      ),
    ]).start();

    await playSound('swish');

    setTimeout(() => {
      router.replace('/(auth)/login');
    }, 580);
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
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#141B39', '#244067', '#2F6C74', '#244067']} style={StyleSheet.absoluteFill} />

      <Animated.View style={[styles.softOrb, { opacity: softLight.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.42] }), transform: [{ scale: softLight.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.1] }) }] }]} />
      <View style={styles.cloudOne} />
      <View style={styles.cloudTwo} />
      <View style={styles.starOne} />
      <View style={styles.starTwo} />

      <View style={styles.farCity}>
        <View style={[styles.building, { height: 84, width: 40 }]} />
        <View style={[styles.building, { height: 66, width: 36 }]} />
        <View style={[styles.building, { height: 92, width: 46 }]} />
        <View style={[styles.building, { height: 74, width: 34 }]} />
      </View>

      <View style={styles.marketRow}>
        <View style={styles.stallCard}><Ionicons name="pricetag" size={18} color="#F8D080" /></View>
        <View style={styles.stallCard}><Ionicons name="swap-horizontal" size={20} color="#76D0BE" /></View>
        <View style={styles.stallCard}><Ionicons name="gift" size={18} color="#FFB9A6" /></View>
        <View style={styles.stallCard}><Ionicons name="phone-portrait" size={17} color="#ABD4FF" /></View>
        <View style={styles.dealBoard}><AppText style={styles.dealText}>لوحة الفرص</AppText></View>
      </View>

      {floatingItems.map((item, i) => {
        const driftX = i % 2 === 0 ? [-5, 4] : [5, -4];
        const rotate = i % 2 === 0 ? ['-3deg', '3deg'] : ['2deg', '-2deg'];
        return (
          <Animated.View
            key={`${item.icon}-${i}`}
            style={[
              styles.item,
              {
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: 34,
                height: 34,
                borderRadius: 17,
                transform: [
                  { translateY: itemFloat[i].interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) },
                  { translateX: itemFloat[i].interpolate({ inputRange: [0, 1], outputRange: driftX }) },
                  { rotate: itemFloat[i].interpolate({ inputRange: [0, 1], outputRange: rotate }) },
                  { scale: itemCenterPull[i].interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) },
                ],
              },
            ]}
          >
            <Ionicons name={item.icon} size={item.size} color="rgba(255,255,255,0.93)" />
          </Animated.View>
        );
      })}

      <Animated.View style={[styles.roadWrap, { transform: [{ scale: roadPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }]}>
        <View style={styles.road} />
        <Animated.View style={[styles.roadDot, { opacity: roadPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] }), transform: [{ translateX: roadPulse.interpolate({ inputRange: [0, 1], outputRange: [-26, 26] }) }] }]} />
      </Animated.View>

      <Animated.View style={[styles.logoWrap, { opacity: logoIn, transform: [{ scale: logoIn.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.02] }) }, { translateY: logoIn.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
        <View style={styles.logoGlow} />
        <AppText style={styles.logo}>تِسوى</AppText>
      </Animated.View>

      <Animated.View style={{ opacity: copyIn, transform: [{ translateY: copyIn.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
        <AppText style={styles.title}>بدّل. اكسب. اكتشف.</AppText>
        <AppText style={styles.subtitle}>كل حاجة ليها فرصة تانية.</AppText>
      </Animated.View>
      <Animated.View style={{ opacity: tinyCopyIn, transform: [{ translateY: tinyCopyIn.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <AppText style={styles.tiny}>ادخل مدينة تسوي وشوف الفرص اللي مستنياك.</AppText>
      </Animated.View>

      <Animated.View style={[styles.controls, { opacity: ctaIn, transform: [{ translateY: ctaIn.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }, { scale: ctaPress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }] }]}>
        <Pressable style={styles.primary} onPress={onStart} disabled={busy}><AppText style={styles.primaryText}>ابدأ المغامرة</AppText></Pressable>
        <Pressable style={styles.secondary} onPress={onSkip} disabled={busy}><AppText style={styles.secondaryText}>تخطي</AppText></Pressable>
      </Animated.View>

      <Pressable style={styles.mute} onPress={onMuteToggle} disabled={busy}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
      </Pressable>

      <Animated.View pointerEvents="none" style={[styles.portal, { opacity: portal.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] }), transform: [{ scale: portal.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.2] }) }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  softOrb: { position: 'absolute', top: 34, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,214,150,0.22)' },
  cloudOne: { position: 'absolute', top: 82, left: 34, width: 90, height: 24, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.09)' },
  cloudTwo: { position: 'absolute', top: 120, right: 36, width: 68, height: 18, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)' },
  starOne: { position: 'absolute', top: 70, right: 90, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)' },
  starTwo: { position: 'absolute', top: 150, left: 110, width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  farCity: { position: 'absolute', bottom: 255, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly', opacity: 0.4 },
  building: { backgroundColor: '#13253E', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  marketRow: { position: 'absolute', bottom: 186, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stallCard: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  dealBoard: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: 'rgba(20,30,53,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  dealText: { color: '#EAF2FF', fontSize: 12, fontWeight: '600' },
  item: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  roadWrap: { position: 'absolute', bottom: 82, width: '100%', alignItems: 'center' },
  road: { width: '80%', height: 90, borderTopLeftRadius: 120, borderTopRightRadius: 120, backgroundColor: 'rgba(235,197,131,0.28)' },
  roadDot: { position: 'absolute', bottom: 18, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFE6AD' },
  logoWrap: { alignItems: 'center', marginTop: 30, marginBottom: spacing.lg },
  logoGlow: { position: 'absolute', width: 176, height: 176, borderRadius: 88, backgroundColor: 'rgba(253,194,104,0.24)' },
  logo: { fontSize: 50, color: '#FFFFFF', fontWeight: '800', marginTop: 42 },
  title: { fontSize: 32, lineHeight: 42, textAlign: 'center', color: '#fff', fontWeight: '700' },
  subtitle: { fontSize: 20, lineHeight: 30, textAlign: 'center', color: 'rgba(255,255,255,0.92)', marginTop: spacing.sm },
  tiny: { fontSize: 14, textAlign: 'center', color: 'rgba(237,246,255,0.84)', marginTop: spacing.sm },
  controls: { width: '100%', marginTop: spacing.xl, gap: spacing.md },
  primary: { backgroundColor: '#F6A15B', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#1B1E3D', fontSize: 18, fontWeight: '800' },
  secondary: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  mute: { position: 'absolute', top: 56, right: 22, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  portal: { position: 'absolute', width: 220, height: 220, borderRadius: 110, bottom: 92, backgroundColor: 'rgba(247,172,95,0.88)' },
});
