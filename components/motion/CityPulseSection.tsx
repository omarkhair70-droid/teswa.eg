import { useEffect, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { Easing, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { CityPulseLocation, CityPulseSnapshot } from '@/lib/city-pulse';
import { buildCityPulseHeroState, buildCityPulseSignals, type CityPulseSignalTone } from '@/lib/city-pulse-signals';

export type CityPulseSectionProps = {
  location: CityPulseLocation | null;
  snapshot: CityPulseSnapshot | null;
  loadingLocation: boolean;
  loadingPulse: boolean;
  error: string | null;
  bootstrapping: boolean;
  cacheNotice: string | null;
  onActivate: () => void;
  onRefresh: () => void;
  onHide: () => void;
  onRetry: () => void;
};

type Metric = {
  id: string;
  value: number;
  label: string;
  tone: CityPulseSignalTone;
};

export function CityPulseSection({ location, snapshot, loadingLocation, loadingPulse, error, bootstrapping, cacheNotice, onActivate, onRefresh, onHide, onRetry }: CityPulseSectionProps) {
  if (bootstrapping) {
    return <ObservatoryShell tone="quiet"><AppText weight="bold">نستعيد نبض مدينتك...</AppText><AppText muted>تِسوى يراجع آخر مشهد محلي محفوظ.</AppText></ObservatoryShell>;
  }

  if (!location && !loadingLocation && !error) {
    return <ObservatoryShell tone="movement"><AppText style={styles.eyebrow}>مرصد النبض المحلي</AppText><AppText weight="bold">نبض تِسوى حولك</AppText><AppText muted>شوف القصص، الأبواب، والناس اللي بيتحركوا قريب منك.</AppText><AppButton label="اكتشف نبض مدينتي" onPress={onActivate} /></ObservatoryShell>;
  }

  if (loadingLocation) {
    return <ObservatoryShell tone="people"><AppText weight="bold">نحدد نبض مدينتك...</AppText><AppText muted>نحتاج لحظة لنعرف المدينة الأقرب لك.</AppText></ObservatoryShell>;
  }

  if (error && !snapshot) {
    return <ObservatoryShell tone="quiet"><AppText style={styles.error}>{error}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={onRetry} /></ObservatoryShell>;
  }

  if (location && loadingPulse && !snapshot) {
    return <ObservatoryShell tone="movement"><AppText style={styles.eyebrow}>مرصد النبض المحلي</AppText><AppText weight="bold">نبض تِسوى حولك</AppText><AppText muted>{`نقرأ نبض: ${location.label}`}</AppText><AppText muted>جارٍ جمع الحركة القريبة...</AppText>{cacheNotice ? <AppText muted>{cacheNotice}</AppText> : null}</ObservatoryShell>;
  }

  if (!location || !snapshot) return null;

  const pulseSignals = buildCityPulseSignals(snapshot);
  const heroState = buildCityPulseHeroState(snapshot);
  const metrics: Metric[] = [
    { id: 'stories', value: snapshot.activeStoryAuthors.length, label: 'قصص قريبة', tone: 'stories' },
    { id: 'moving', value: snapshot.movingItems.length, label: 'أبواب تتحرك', tone: 'movement' },
    { id: 'people', value: snapshot.people.length, label: 'ناس في النبض', tone: 'people' },
    { id: 'story-items', value: snapshot.storyItems.length, label: 'حكايات قريبة', tone: 'stories' },
  ];

  return <View style={styles.card}>
    <LinearGradient colors={['rgba(255,253,248,0.98)', 'rgba(238,216,203,0.58)', 'rgba(249,243,234,0.95)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={styles.heroGlowWarm} />
    <View style={styles.heroGlowAccent} />
    <View style={styles.row}><View style={styles.titleBlock}><AppText style={styles.eyebrow}>مرصد النبض المحلي</AppText><AppText weight="bold">نبض تِسوى حولك</AppText><AppText muted>{`نقرأ نبض: ${location.label}`}</AppText></View><View style={styles.actions}><Pressable onPress={onRefresh} hitSlop={8}><AppText style={styles.link}>تحديث النبض</AppText></Pressable><Pressable onPress={onHide} hitSlop={8}><AppText style={styles.linkMuted}>إخفاء</AppText></Pressable></View></View>
    {cacheNotice ? <View style={styles.cacheNotice}><AppText muted>{cacheNotice}</AppText></View> : null}
    {error ? <View style={styles.errorInline}><AppText style={styles.error}>{error}</AppText><Pressable onPress={onRetry}><AppText style={styles.link}>إعادة المحاولة</AppText></Pressable></View> : null}

    <View style={styles.heroPanel}>
      <LinearGradient colors={getHeroGradient(heroState.tone)} start={{ x: 0.06, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.heroPanelOrbOne} />
      <View style={styles.heroPanelOrbTwo} />
      <View style={styles.heroCopy}><AppText style={styles.heroEyebrow}>المشهد حولك الآن</AppText><AppText style={styles.heroHeadline} weight="bold">{heroState.headline}</AppText><AppText style={styles.heroBody}>{heroState.body}</AppText></View>
      <PulseOrb tone={heroState.tone} />
    </View>

    <View style={styles.metricsGrid}>{metrics.map((metric) => <View key={metric.id} style={[styles.metricCard, getToneStyle(metric.tone, 'metric')]}><AppText style={[styles.metricValue, getToneStyle(metric.tone, 'text')]} weight="bold">{metric.value}</AppText><AppText style={styles.metricLabel}>{metric.label}</AppText></View>)}</View>

    <View style={styles.signalsBlock}><View style={styles.blockHeader}><AppText style={styles.eyebrow}>نبضات محلية</AppText><AppText weight="semibold">نبض المدينة الآن</AppText></View>{pulseSignals.map((signal, index) => <Animated.View entering={FadeInUp.duration(260).delay(index * 55)} key={signal.id} style={[styles.signalRow, getToneStyle(signal.tone, 'signal')]}><View style={[styles.signalGlow, getToneStyle(signal.tone, 'marker')]} /><View style={[styles.signalMarker, getToneStyle(signal.tone, 'marker')]} /><View style={styles.signalContent}><AppText weight="semibold">{signal.title}</AppText><AppText muted>{signal.body}</AppText></View></Animated.View>)}</View>

    <Section title="قصص قريبة" subtitle="من ناس في نفس النبض المحلي." empty="لسه مفيش قصص قريبة ظاهرة.">{snapshot.activeStoryAuthors.map((entry) => <Pressable key={entry.author.id} style={styles.storyPersonCard} onPress={() => router.push(`/story/${entry.author.id}`)}><Avatar uri={entry.author.avatarUrl} label={entry.author.displayName || entry.author.username || 'م'} tone="stories" /><AppText numberOfLines={1} weight="semibold">{entry.author.displayName || (entry.author.username ? `@${entry.author.username}` : 'مستخدم')}</AppText>{entry.storiesCount > 1 ? <View style={styles.storyCountPill}><AppText style={styles.storyCountText}>{`${entry.storiesCount} قصص`}</AppText></View> : null}</Pressable>)}</Section>
    <Section title="أبواب بدأت تتحرك حواليك" empty="لسه مفيش أبواب محلية تتحرك.">{snapshot.movingItems.map((item) => <Pressable key={item.id} style={styles.itemCard} onPress={() => router.push(`/item/${item.id}`)}><View style={styles.thumbFrame}><Thumb uri={item.imageUrl} /></View><AppText numberOfLines={1} weight="semibold">{item.title}</AppText><AppText muted numberOfLines={1}>{[item.city, item.area].filter(Boolean).join(' / ') || 'محلي'}</AppText><View style={styles.interestBadge}><AppText style={styles.interestBadgeText}>{item.openInterestCount === 1 ? 'وصلها اقتراح' : `وصلها ${item.openInterestCount} اقتراحات`}</AppText></View></Pressable>)}</Section>
    <Section title="حكايات قريبة" empty="لسه مفيش حكايات قريبة ظهرت.">{snapshot.storyItems.map((item) => <Pressable key={item.id} style={styles.storyItemCard} onPress={() => router.push(`/item/${item.id}`)}><View style={styles.thumbFrame}><Thumb uri={item.imageUrl} /></View><View style={styles.storyLabelPill}><AppText style={styles.micro}>{item.storyLabel}</AppText></View><AppText numberOfLines={1} weight="semibold">{item.title}</AppText><AppText numberOfLines={2} muted>{item.storySnippet}</AppText></Pressable>)}</Section>
    <Section title="ناس من نفس النبض" empty="لسه النبض المحلي هادي هنا.">{snapshot.people.map((person) => <Pressable key={person.id} style={styles.personCard} onPress={() => router.push(`/profile/${person.id}`)}><Avatar uri={person.avatarUrl} label={person.displayName} tone="people" /><AppText numberOfLines={1} weight="semibold">{person.displayName}</AppText><AppText muted numberOfLines={1}>{[person.city, person.area].filter(Boolean).join(' / ') || 'محلي'}</AppText>{person.activeItemsCount > 0 ? <View style={styles.activeItemsPill}><AppText style={styles.activeItemsText}>{`${person.activeItemsCount} عناصر نشطة`}</AppText></View> : null}</Pressable>)}</Section>
  </View>;
}

function ObservatoryShell({ tone, children }: { tone: CityPulseSignalTone; children: ReactNode }) {
  return <View style={styles.card}>
    <LinearGradient colors={getShellGradient(tone)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={styles.heroGlowWarm} />
    <View style={styles.shellContent}><PulseOrb tone={tone} compact />{children}</View>
  </View>;
}

function PulseOrb({ tone, compact = false }: { tone: CityPulseSignalTone; compact?: boolean }) {
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [breath]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.34 + breath.value * 0.34,
    transform: [{ scale: 0.92 + breath.value * 0.12 }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: 0.74 + breath.value * 0.16,
    transform: [{ scale: 0.98 + breath.value * 0.04 }],
  }));

  return <View style={[styles.pulseOrb, compact ? styles.pulseOrbCompact : null]}>
    <Animated.View style={[styles.pulseRing, getToneStyle(tone, 'orb'), ringStyle]} />
    <Animated.View style={[styles.pulseCore, getToneStyle(tone, 'orb'), coreStyle]} />
    <View style={[styles.pulseDot, getToneStyle(tone, 'marker')]} />
  </View>;
}

function Section({ title, subtitle, empty, children }: { title: string; subtitle?: string; empty: string; children: ReactNode[] }) {
  return <View style={styles.section}><View style={styles.sectionHeader}><AppText weight="semibold">{title}</AppText>{subtitle ? <AppText muted>{subtitle}</AppText> : null}</View>{children.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{children}</ScrollView> : <View style={styles.emptyRail}><AppText muted>{empty}</AppText></View>}</View>;
}

function Avatar({ uri, label, tone }: { uri: string | null; label: string; tone: CityPulseSignalTone }) {
  return <LinearGradient colors={tone === 'stories' ? ['#3E7C73', '#FFF6E8', '#B8623F'] : ['#EED8CB', '#FFFDF8', '#3E7C73']} style={styles.avatarRing}>{uri ? <ExpoImage source={{ uri }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold">{label.charAt(0).toUpperCase()}</AppText></View>}</LinearGradient>;
}

function Thumb({ uri }: { uri: string | null }) {
  return uri ? <ExpoImage source={{ uri }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbFallback]}><AppText muted>بدون صورة</AppText></View>;
}

function getHeroGradient(tone: CityPulseSignalTone): [string, string, string] {
  if (tone === 'stories') return ['#1F2D2A', '#3E7C73', '#F3DDC9'];
  if (tone === 'people') return ['#2D2A25', '#5D6F68', '#F1E3D4'];
  if (tone === 'quiet') return ['#3A332D', '#746A61', '#F3E9DD'];
  return ['#2B1B14', '#B8623F', '#F2D3BD'];
}

function getShellGradient(tone: CityPulseSignalTone): [string, string, string] {
  if (tone === 'people') return ['rgba(255,253,248,0.98)', 'rgba(221,230,225,0.82)', 'rgba(249,243,234,0.98)'];
  if (tone === 'quiet') return ['rgba(255,253,248,0.98)', 'rgba(221,208,197,0.58)', 'rgba(249,243,234,0.98)'];
  return ['rgba(255,253,248,0.98)', 'rgba(238,216,203,0.72)', 'rgba(249,243,234,0.98)'];
}

function getToneStyle(tone: CityPulseSignalTone, target: 'text'): StyleProp<TextStyle>;
function getToneStyle(tone: CityPulseSignalTone, target: 'metric' | 'signal' | 'marker' | 'orb'): StyleProp<ViewStyle>;
function getToneStyle(tone: CityPulseSignalTone, target: 'metric' | 'signal' | 'marker' | 'text' | 'orb'): StyleProp<ViewStyle> | StyleProp<TextStyle> {
  const toneMap = {
    movement: {
      metric: styles.metricMovement,
      signal: styles.signalMovement,
      marker: styles.signalMarkerMovement,
      text: styles.metricTextMovement,
      orb: styles.orbMovement,
    },
    stories: {
      metric: styles.metricStories,
      signal: styles.signalStories,
      marker: styles.signalMarkerStories,
      text: styles.metricTextStories,
      orb: styles.orbStories,
    },
    people: {
      metric: styles.metricPeople,
      signal: styles.signalPeople,
      marker: styles.signalMarkerPeople,
      text: styles.metricTextPeople,
      orb: styles.orbPeople,
    },
    quiet: {
      metric: styles.metricQuiet,
      signal: styles.signalQuiet,
      marker: styles.signalMarkerQuiet,
      text: styles.metricTextQuiet,
      orb: styles.orbQuiet,
    },
  };

  return toneMap[tone][target];
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: 'rgba(184,98,63,0.22)', borderRadius: radii.xl, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md, overflow: 'hidden' },
  shellContent: { gap: spacing.sm },
  titleBlock: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  actions: { alignItems: 'flex-end', gap: spacing.xs },
  link: { color: colors.primary },
  linkMuted: { color: colors.textMuted },
  eyebrow: { color: colors.primary, fontSize: 12, letterSpacing: 0.5 },
  heroGlowWarm: { position: 'absolute', top: -44, right: -34, width: 132, height: 132, borderRadius: radii.round, backgroundColor: 'rgba(184,98,63,0.14)' },
  heroGlowAccent: { position: 'absolute', bottom: 44, left: -42, width: 118, height: 118, borderRadius: radii.round, backgroundColor: 'rgba(62,124,115,0.10)' },
  cacheNotice: { borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', borderRadius: radii.md, backgroundColor: 'rgba(255,253,248,0.72)', padding: spacing.sm },
  heroPanel: { minHeight: 154, borderRadius: radii.xl, overflow: 'hidden', padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)' },
  heroPanelOrbOne: { position: 'absolute', top: -50, left: -26, width: 130, height: 130, borderRadius: radii.round, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroPanelOrbTwo: { position: 'absolute', bottom: -42, right: 16, width: 116, height: 116, borderRadius: radii.round, backgroundColor: 'rgba(255,253,248,0.15)' },
  heroCopy: { flex: 1, gap: spacing.xs },
  heroEyebrow: { color: 'rgba(255,253,248,0.78)', fontSize: 11, letterSpacing: 0.7 },
  heroHeadline: { color: colors.white, fontSize: 22, lineHeight: 31 },
  heroBody: { color: 'rgba(255,253,248,0.86)', lineHeight: 22 },
  pulseOrb: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  pulseOrbCompact: { alignSelf: 'flex-end', width: 62, height: 62 },
  pulseRing: { position: 'absolute', width: '100%', height: '100%', borderRadius: radii.round, borderWidth: 1.5 },
  pulseCore: { width: '60%', height: '60%', borderRadius: radii.round, borderWidth: 1 },
  pulseDot: { position: 'absolute', width: 13, height: 13, borderRadius: radii.round, borderWidth: 2, borderColor: 'rgba(255,253,248,0.74)' },
  orbMovement: { borderColor: 'rgba(255,246,232,0.72)', backgroundColor: 'rgba(184,98,63,0.26)' },
  orbStories: { borderColor: 'rgba(255,246,232,0.72)', backgroundColor: 'rgba(62,124,115,0.30)' },
  orbPeople: { borderColor: 'rgba(255,246,232,0.66)', backgroundColor: 'rgba(238,216,203,0.24)' },
  orbQuiet: { borderColor: 'rgba(255,253,248,0.48)', backgroundColor: 'rgba(116,106,97,0.22)' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricCard: { width: '47.8%', borderWidth: 1, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2 },
  metricValue: { fontSize: 22, lineHeight: 28 },
  metricLabel: { color: colors.textMuted, fontSize: 12 },
  metricMovement: { backgroundColor: 'rgba(184,98,63,0.12)', borderColor: 'rgba(184,98,63,0.22)' },
  metricStories: { backgroundColor: 'rgba(62,124,115,0.11)', borderColor: 'rgba(62,124,115,0.20)' },
  metricPeople: { backgroundColor: 'rgba(255,253,248,0.78)', borderColor: 'rgba(221,208,197,0.78)' },
  metricQuiet: { backgroundColor: 'rgba(116,106,97,0.08)', borderColor: 'rgba(116,106,97,0.16)' },
  metricTextMovement: { color: colors.primary },
  metricTextStories: { color: colors.accent },
  metricTextPeople: { color: colors.text },
  metricTextQuiet: { color: colors.textMuted },
  blockHeader: { gap: 2 },
  signalsBlock: { borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', borderRadius: radii.xl, backgroundColor: 'rgba(255,253,248,0.64)', padding: spacing.md, gap: spacing.sm },
  signalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radii.lg, padding: spacing.sm, overflow: 'hidden' },
  signalContent: { flex: 1, gap: 2 },
  signalGlow: { position: 'absolute', top: -18, right: -18, width: 58, height: 58, borderRadius: radii.round, opacity: 0.12 },
  signalMarker: { width: 7, height: 42, borderRadius: radii.round },
  signalMovement: { backgroundColor: 'rgba(184,98,63,0.12)', borderColor: 'rgba(184,98,63,0.18)' },
  signalStories: { backgroundColor: 'rgba(62,124,115,0.10)', borderColor: 'rgba(62,124,115,0.18)' },
  signalPeople: { backgroundColor: 'rgba(255,253,248,0.80)', borderColor: 'rgba(221,208,197,0.78)' },
  signalQuiet: { backgroundColor: 'rgba(116,106,97,0.07)', borderColor: 'rgba(116,106,97,0.14)' },
  signalMarkerMovement: { backgroundColor: colors.primary },
  signalMarkerStories: { backgroundColor: colors.accent },
  signalMarkerPeople: { backgroundColor: colors.border },
  signalMarkerQuiet: { backgroundColor: colors.textMuted },
  section: { gap: spacing.sm },
  sectionHeader: { gap: 2 },
  rail: { gap: spacing.sm, paddingRight: spacing.md, paddingVertical: spacing.xs },
  emptyRail: { borderWidth: 1, borderColor: 'rgba(221,208,197,0.72)', borderRadius: radii.lg, backgroundColor: 'rgba(255,253,248,0.56)', padding: spacing.md },
  itemCard: { width: 184, borderWidth: 1, borderColor: 'rgba(184,98,63,0.18)', borderRadius: radii.xl, padding: spacing.sm, gap: spacing.xs, backgroundColor: 'rgba(255,255,255,0.86)' },
  storyItemCard: { width: 184, borderWidth: 1, borderColor: 'rgba(62,124,115,0.18)', borderRadius: radii.xl, padding: spacing.sm, gap: spacing.xs, backgroundColor: 'rgba(255,255,255,0.86)' },
  storyPersonCard: { width: 128, gap: spacing.xs, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(62,124,115,0.16)', borderRadius: radii.xl, backgroundColor: 'rgba(255,253,248,0.64)', padding: spacing.sm },
  personCard: { width: 132, gap: spacing.xs, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(221,208,197,0.82)', borderRadius: radii.xl, backgroundColor: 'rgba(255,253,248,0.70)', padding: spacing.sm },
  avatarRing: { width: 64, height: 64, borderRadius: radii.round, padding: 3, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 58, height: 58, borderRadius: radii.round, backgroundColor: colors.background },
  avatarFallback: { width: 58, height: 58, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  thumbFrame: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.86)', borderRadius: radii.lg, padding: 3, backgroundColor: 'rgba(238,216,203,0.52)' },
  thumb: { width: '100%', height: 104, borderRadius: radii.md, backgroundColor: colors.background },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  micro: { color: colors.accent, fontSize: 12 },
  storyLabelPill: { alignSelf: 'flex-start', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: 'rgba(62,124,115,0.10)' },
  interestBadge: { alignSelf: 'flex-start', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: 'rgba(184,98,63,0.12)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)' },
  interestBadgeText: { color: colors.primary, fontSize: 12 },
  storyCountPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: 'rgba(62,124,115,0.10)' },
  storyCountText: { color: colors.accent, fontSize: 12 },
  activeItemsPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: 'rgba(184,98,63,0.10)' },
  activeItemsText: { color: colors.primary, fontSize: 12 },
  error: { color: '#B42318' },
  errorInline: { borderWidth: 1, borderColor: 'rgba(180,35,24,0.32)', backgroundColor: 'rgba(255,253,248,0.74)', borderRadius: radii.md, padding: spacing.sm, gap: spacing.xs },
});
