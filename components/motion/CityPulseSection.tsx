import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { CityPulseLocation, CityPulseSnapshot } from '@/lib/city-pulse';

export type CityPulseSectionProps = { location: CityPulseLocation | null; snapshot: CityPulseSnapshot | null; loadingLocation: boolean; loadingPulse: boolean; error: string | null; onActivate: () => void; onRefresh: () => void; onHide: () => void; onRetry: () => void };

export function CityPulseSection({ location, snapshot, loadingLocation, loadingPulse, error, onActivate, onRefresh, onHide, onRetry }: CityPulseSectionProps) {
  if (!location && !loadingLocation && !error) return <View style={styles.card}><AppText weight="bold">نبض تِسوى حولك</AppText><AppText muted>شوف القصص، الأبواب، والناس اللي بيتحركوا قريب منك.</AppText><AppButton label="اكتشف نبض مدينتي" onPress={onActivate} /></View>;
  if (loadingLocation) return <View style={styles.card}><AppText weight="bold">نحدد نبض مدينتك...</AppText><AppText muted>نحتاج لحظة لنعرف المدينة الأقرب لك.</AppText></View>;
  if (error && !snapshot) return <View style={styles.card}><AppText style={styles.error}>{error}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={onRetry} /></View>;
  if (location && loadingPulse && !snapshot) return <View style={styles.card}><AppText weight="bold">نبض تِسوى حولك</AppText><AppText muted>{`نقرأ نبض: ${location.label}`}</AppText><AppText muted>جارٍ جمع الحركة القريبة...</AppText></View>;
  if (!location || !snapshot) return null;

  return <View style={styles.card}><View style={styles.row}><View><AppText weight="bold">نبض تِسوى حولك</AppText><AppText muted>{`نقرأ نبض: ${location.label}`}</AppText></View><View style={styles.actions}><Pressable onPress={onRefresh}><AppText style={styles.link}>تحديث النبض</AppText></Pressable><Pressable onPress={onHide}><AppText style={styles.linkMuted}>إخفاء</AppText></Pressable></View></View>
    {error ? <View style={styles.errorInline}><AppText style={styles.error}>{error}</AppText><Pressable onPress={onRetry}><AppText style={styles.link}>إعادة المحاولة</AppText></Pressable></View> : null}
    <View style={styles.chips}>{[
      `${snapshot.activeStoryAuthors.length} قصص قريبة`,
      `${snapshot.movingItems.length} أبواب تتحرك`,
      `${snapshot.people.length} ناس في النبض`,
      `${snapshot.storyItems.length} حكايات قريبة`,
    ].map((t) => <View key={t} style={styles.chip}><AppText style={styles.chipText}>{t}</AppText></View>)}</View>
    <Section title="قصص قريبة" subtitle="من ناس في نفس النبض المحلي." empty="لسه مفيش قصص قريبة ظاهرة.">{snapshot.activeStoryAuthors.map((entry) => <Pressable key={entry.author.id} style={styles.personCard} onPress={() => router.push(`/story/${entry.author.id}`)}><Avatar uri={entry.author.avatarUrl} label={entry.author.displayName || entry.author.username || 'م'} /><AppText numberOfLines={1}>{entry.author.displayName || (entry.author.username ? `@${entry.author.username}` : 'مستخدم')}</AppText>{entry.storiesCount > 1 ? <AppText muted>{`${entry.storiesCount} قصص`}</AppText> : null}</Pressable>)}</Section>
    <Section title="أبواب بدأت تتحرك حواليك" empty="لسه مفيش أبواب محلية تتحرك.">{snapshot.movingItems.map((item) => <Pressable key={item.id} style={styles.itemCard} onPress={() => router.push(`/item/${item.id}`)}><Thumb uri={item.imageUrl} /><AppText numberOfLines={1} weight="semibold">{item.title}</AppText><AppText muted numberOfLines={1}>{[item.city, item.area].filter(Boolean).join(' / ') || 'محلي'}</AppText><AppText style={styles.badge}>{item.openInterestCount === 1 ? 'وصلها اقتراح' : `وصلها ${item.openInterestCount} اقتراحات`}</AppText></Pressable>)}</Section>
    <Section title="حكايات قريبة" empty="لسه مفيش حكايات قريبة ظهرت.">{snapshot.storyItems.map((item) => <Pressable key={item.id} style={styles.itemCard} onPress={() => router.push(`/item/${item.id}`)}><Thumb uri={item.imageUrl} /><AppText style={styles.micro}>{item.storyLabel}</AppText><AppText numberOfLines={1} weight="semibold">{item.title}</AppText><AppText numberOfLines={2} muted>{item.storySnippet}</AppText></Pressable>)}</Section>
    <Section title="ناس من نفس النبض" empty="لسه النبض المحلي هادي هنا.">{snapshot.people.map((person) => <Pressable key={person.id} style={styles.personCard} onPress={() => router.push(`/profile/${person.id}`)}><Avatar uri={person.avatarUrl} label={person.displayName} /><AppText numberOfLines={1}>{person.displayName}</AppText><AppText muted numberOfLines={1}>{[person.city, person.area].filter(Boolean).join(' / ') || 'محلي'}</AppText>{person.activeItemsCount > 0 ? <AppText muted>{`${person.activeItemsCount} عناصر نشطة`}</AppText> : null}</Pressable>)}</Section>
  </View>;
}

function Section({ title, subtitle, empty, children }: { title: string; subtitle?: string; empty: string; children: React.ReactNode[] }) { return <View style={styles.section}><AppText weight="semibold">{title}</AppText>{subtitle ? <AppText muted>{subtitle}</AppText> : null}{children.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{children}</ScrollView> : <AppText muted>{empty}</AppText>}</View>; }
const Avatar = ({ uri, label }: { uri: string | null; label: string }) => uri ? <ExpoImage source={{ uri }} style={styles.avatar} /> : <View style={styles.avatarFallback}><AppText weight="bold">{label.charAt(0).toUpperCase()}</AppText></View>;
const Thumb = ({ uri }: { uri: string | null }) => uri ? <ExpoImage source={{ uri }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbFallback]}><AppText muted>بدون صورة</AppText></View>;

const styles = StyleSheet.create({ card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }, actions: { alignItems: 'flex-end', gap: spacing.xs }, link: { color: colors.primary }, linkMuted: { color: colors.textMuted }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, chip: { backgroundColor: colors.primarySoft, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, chipText: { color: colors.primary, fontSize: 12 }, section: { gap: spacing.xs }, rail: { gap: spacing.sm, paddingRight: spacing.md }, itemCard: { width: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.white }, personCard: { width: 120, gap: spacing.xs, alignItems: 'center' }, avatar: { width: 56, height: 56, borderRadius: radii.round }, avatarFallback: { width: 56, height: 56, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, thumb: { width: '100%', height: 100, borderRadius: radii.md, backgroundColor: colors.background }, thumbFallback: { alignItems: 'center', justifyContent: 'center' }, micro: { color: colors.primary, fontSize: 12 }, badge: { color: colors.accent, fontSize: 12 }, error: { color: '#B42318' }, errorInline: { borderWidth: 1, borderColor: '#B42318', borderRadius: radii.md, padding: spacing.sm, gap: spacing.xs } });
