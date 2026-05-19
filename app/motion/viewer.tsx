import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { PulseViewerVideoPage } from '@/components/motion/PulseViewerVideoPage';
import { VideoCacheWarmup } from '@/components/media/VideoCacheWarmup';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { fetchPulseViewerEntries, PulseViewerEntry } from '@/lib/pulse-video-viewer';
import { getMediaNeighborIndexes } from '@/lib/media/media-performance';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function MotionViewerScreen() { /* trimmed for brevity */
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<PulseViewerEntry[]>([]);
  const [storyVideosFailed, setStoryVideosFailed] = useState(false);
  const [itemTeasersFailed, setItemTeasersFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const load = useCallback(async () => { setLoading(true); try { const result = await fetchPulseViewerEntries({ storyLimit: 10, itemLimit: 10, totalLimit: 16 }); setEntries(result.entries); setStoryVideosFailed(result.storyVideosFailed); setItemTeasersFailed(result.itemTeasersFailed); setActiveIndex(0); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const hardError = useMemo(() => !loading && entries.length === 0 && storyVideosFailed && itemTeasersFailed, [entries.length, itemTeasersFailed, loading, storyVideosFailed]);
  const empty = !loading && entries.length === 0 && !hardError;
  const partial = entries.length > 0 && (storyVideosFailed || itemTeasersFailed);
  const warmupIndexes = useMemo(() => getMediaNeighborIndexes(activeIndex, entries.length, { previous: 1, next: 2 }), [activeIndex, entries.length]);
  if (loading) return <View style={styles.center}><AppText style={styles.text}>نجهّز شوف الحركة...</AppText></View>;
  if (hardError) return <View style={styles.center}><AppText weight="bold" style={styles.title}>تعذر فتح مشاهد الحركة</AppText><AppText style={styles.text}>حاول مرة أخرى بعد لحظات.</AppText><Pressable style={styles.btn} onPress={load}><AppText style={styles.btnText}>إعادة المحاولة</AppText></Pressable><Pressable style={styles.ghostBtn} onPress={() => router.back()}><AppText style={styles.text}>الرجوع</AppText></Pressable></View>;
  if (empty) return <View style={styles.center}><AppText weight="bold" style={styles.title}>لسه مفيش مشاهد فيديو كفاية</AppText><AppText style={styles.text}>أول ما تنزل قصص فيديو ولمحات عناصر، هتلاقيها هنا.</AppText><Pressable style={styles.btn} onPress={() => router.back()}><AppText style={styles.btnText}>الرجوع للحركة</AppText></Pressable></View>;
  return <View style={styles.root}><FlatList data={entries} keyExtractor={(i) => i.id} pagingEnabled showsVerticalScrollIndicator={false} renderItem={({ item, index }) => <View style={{ height: SCREEN_HEIGHT }}><PulseViewerVideoPage entry={item} active={index === activeIndex} /></View>} onMomentumScrollEnd={(e) => setActiveIndex(Math.max(0, Math.min(entries.length - 1, Math.round(e.nativeEvent.contentOffset.y / SCREEN_HEIGHT))))} /><View style={styles.topBar}><Pressable onPress={() => router.back()} style={styles.topBtn}><Ionicons name="close" size={20} color="#fff" /></Pressable><AppText weight="bold" style={styles.topTitle}>شوف الحركة</AppText><AppText style={styles.progress}>{activeIndex + 1} / {entries.length}</AppText></View>{partial ? <View style={styles.notice}><AppText style={styles.noticeText}>تعذر تحميل جزء من المشاهد الآن، نعرض المتاح.</AppText></View> : null}{warmupIndexes.map((index) => <VideoCacheWarmup key={entries[index]?.id ?? String(index)} uri={entries[index]?.signedVideoUrl ?? null} />)}</View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#050507' }, center: { flex: 1, backgroundColor: '#050507', alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm }, title: { color: '#fff', fontSize: 22, textAlign: 'center' }, text: { color: 'rgba(255,255,255,0.86)', textAlign: 'center' }, btn: { marginTop: spacing.sm, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999 }, btnText: { color: '#fff' }, ghostBtn: { padding: spacing.sm }, topBar: { position: 'absolute', top: 54, left: spacing.md, right: spacing.md, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }, topBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }, topTitle: { color: '#fff' }, progress: { color: '#fff' }, notice: { position: 'absolute', bottom: 22, alignSelf: 'center', backgroundColor: 'rgba(10,10,10,0.72)', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 999 }, noticeText: { color: '#fff', fontSize: 12 } });
