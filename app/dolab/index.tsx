import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

const draftItems = [
  { id: 'd1', title: 'جاكيت شتوي نظيف', hint: 'جاهز للتصوير النهائي والنشر لاحقًا.' },
  { id: 'd2', title: 'طقم قهوة تراثي', hint: 'يحتاج تحديد حالة القطع قبل العرض.' },
];
const mediaItems = [
  { id: 'm1', label: 'صورة منتج', type: 'image-outline' as const },
  { id: 'm2', label: 'فيديو قصير', type: 'videocam-outline' as const },
  { id: 'm3', label: 'لقطة تفاصيل', type: 'images-outline' as const },
];
const exchangeIdeas = [
  { id: 'e1', text: 'تبادل الطقم مع جهاز مطبخ صغير بحالة ممتازة.' },
  { id: 'e2', text: 'دمج عنصرين في عرض واحد لتسريع التبادل.' },
];

export default function DolabScreen() {
  const router = useRouter();
  const addSheetRef = useRef<BottomSheetModal>(null);
  const glow = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const [inlineFeedback, setInlineFeedback] = useState<string | null>(null);

  useEffect(() => {
    const glowLoop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 2400, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ]));
    const driftLoop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 3400, useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 3400, useNativeDriver: true }),
    ]));
    glowLoop.start();
    driftLoop.start();
    return () => {
      glowLoop.stop();
      driftLoop.stop();
      glow.stopAnimation();
      drift.stopAnimation();
    };
  }, [drift, glow]);

  const sheetActions = useMemo(() => ['صوّر حاجة', 'ارفع صور', 'ارفع فيديو', 'اكتب ملاحظة', 'سجل صوت', 'مسودة عنصر'].map((label) => ({
    label,
    onPress: () => {
      addSheetRef.current?.dismiss();
      setInlineFeedback(`قريبًا في دولاب تسوى: ${label}`);
    },
  })), []);

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="الرجوع من شاشة دولاب تسوى">
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
          <AppText weight="bold" style={styles.headerTitle}>دولاب تسوى</AppText>
        </View>

        <LinearGradient colors={['#FFF8EE', '#F4EDE4', '#F2F7F6']} style={styles.hero}>
          <Animated.View style={[styles.heroGlow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }) }]} />
          <Animated.View style={[styles.floatingChip, { transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }]}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.primary} />
            <AppText style={styles.chipText}>خاص</AppText>
          </Animated.View>
          <Animated.View style={[styles.floatingChipSecondary, { transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-2, 6] }) }] }]}>
            <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
            <AppText style={styles.chipText}>حيّ</AppText>
          </Animated.View>

          <View style={styles.heroTopIcon}><Ionicons name="archive-outline" size={22} color={colors.primary} /></View>
          <AppText weight="bold" style={styles.heroTitle}>دولاب تسوى</AppText>
          <AppText muted style={styles.heroSubtitle}>مكانك الخاص لتجميع الصور، الفيديوهات، الأفكار، والحاجات اللي ممكن تتحول لتبادل.</AppText>
        </LinearGradient>

        <AppCard><View style={styles.sectionHeader}><AppText weight="bold">جاهز يتحول لعرض</AppText><AppText muted>مسودات جاهزة لخطوة السوق لاحقًا.</AppText></View><View style={styles.listWrap}>{draftItems.map((item) => <View key={item.id} style={styles.rowCard}><Ionicons name="cube-outline" size={18} color={colors.primary} /><View style={styles.rowCopy}><AppText weight="semibold">{item.title}</AppText><AppText muted style={styles.smallText}>{item.hint}</AppText></View></View>)}</View></AppCard>

        <AppCard><View style={styles.sectionHeader}><AppText weight="bold">ميديا محفوظة</AppText><AppText muted>معاينات سريعة لما سيتم حفظه داخل الدولاب.</AppText></View><View style={styles.mediaGrid}>{mediaItems.map((media) => <View key={media.id} style={styles.mediaCard}><Ionicons name={media.type} size={19} color={colors.accent} /><AppText style={styles.smallText}>{media.label}</AppText></View>)}</View></AppCard>

        <AppCard><View style={styles.sectionHeader}><AppText weight="bold">أفكار التبادل</AppText><AppText muted>ملاحظات خاصة تُجهّز صفقات أذكى.</AppText></View><View style={styles.listWrap}>{exchangeIdeas.map((idea) => <View key={idea.id} style={styles.noteCard}><Ionicons name="document-text-outline" size={16} color={colors.primary} /><AppText>{idea.text}</AppText></View>)}</View></AppCard>

        <AppCard>
          <EmptyState title="المساحة الفارغة جاهزة لك" description="عند ربط البيانات الحقيقية، ستظهر هنا العناصر والميديا والأفكار الجديدة." icon={<Ionicons name="folder-open-outline" size={28} color={colors.textMuted} />} />
          <AppButton label="ابدأ الإضافة الآن" variant="neutral" onPress={() => addSheetRef.current?.present()} />
        </AppCard>

        <View style={styles.ctaWrap}><AppButton label="أضف للدولاب" onPress={() => addSheetRef.current?.present()} /><AppText muted style={styles.feedbackText}>{inlineFeedback ?? 'اختَر طريقة البداية، والباقي قريبًا.'}</AppText></View>
      </ScrollView>

      <AppActionSheet ref={addSheetRef} title="أضف حاجة للدولاب" description="ابدأ بصورة، فيديو، ملاحظة، أو مسودة تبادل." titleIconName="add-circle-outline" snapPoints={['52%']} actions={sheetActions} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  backButton: { width: 40, height: 40, borderRadius: radii.round, borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)' },
  headerTitle: { fontSize: 22 },
  hero: { borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)', padding: spacing.lg, overflow: 'hidden', gap: spacing.sm },
  heroGlow: { position: 'absolute', width: 170, height: 170, borderRadius: radii.round, backgroundColor: 'rgba(184,98,63,0.22)', left: -30, top: -20 },
  heroTopIcon: { width: 44, height: 44, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.9)', borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)' },
  heroTitle: { fontSize: 28 }, heroSubtitle: { lineHeight: 23 },
  floatingChip: { position: 'absolute', top: 16, right: 16, flexDirection: 'row-reverse', gap: 4, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.84)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round },
  floatingChipSecondary: { position: 'absolute', bottom: 18, left: 14, flexDirection: 'row-reverse', gap: 4, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.84)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round },
  chipText: { fontSize: 12 }, sectionHeader: { gap: 3, marginBottom: spacing.xs }, listWrap: { gap: spacing.xs },
  rowCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, backgroundColor: '#FFFDF9' },
  rowCopy: { flex: 1, gap: 2 }, smallText: { fontSize: 12 }, mediaGrid: { flexDirection: 'row-reverse', gap: spacing.xs, flexWrap: 'wrap' },
  mediaCard: { width: '31%', minWidth: 90, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingVertical: spacing.md, alignItems: 'center', gap: 6, backgroundColor: '#FFFDF9' },
  noteCard: { gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.sm, backgroundColor: '#FFFEFC' },
  ctaWrap: { gap: spacing.xs, marginBottom: spacing.md }, feedbackText: { textAlign: 'center' },
});
