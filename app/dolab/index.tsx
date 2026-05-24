import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
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
import { toPendingMedia } from '@/lib/dolab/local-media';
import type { DolabPendingMedia } from '@/lib/dolab/media-types';

const draftItems = [
  { id: 'd1', title: 'جاكيت شتوي نظيف', hint: 'جاهز للتصوير النهائي والنشر لاحقًا.' },
  { id: 'd2', title: 'طقم قهوة تراثي', hint: 'يحتاج تحديد حالة القطع قبل العرض.' },
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
  const [pendingMedia, setPendingMedia] = useState<DolabPendingMedia[]>([]);

  const appendMedia = (items: DolabPendingMedia[]) => setPendingMedia((prev) => [...items, ...prev]);

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('محتاجين إذن الصور عشان ترفع صور للدولاب.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء اختيار الصور.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'image'));
    appendMedia(items);
    setInlineFeedback(`تمت إضافة ${items.length} صورة للدولاب المحلي.`);
  };

  const pickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('محتاجين إذن الصور والفيديو عشان ترفع فيديو.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء اختيار الفيديو.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'video'));
    appendMedia(items);
    setInlineFeedback('تمت إضافة فيديو للدولاب المحلي.');
  };

  const captureImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setInlineFeedback('إذن الكاميرا مرفوض. فعّله من الإعدادات للتصوير.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });

    if (result.canceled) {
      setInlineFeedback('تم إلغاء التصوير.');
      return;
    }

    const items = result.assets.map((asset) => toPendingMedia(asset, 'image'));
    appendMedia(items);
    setInlineFeedback('تم التقاط صورة وإضافتها للدولاب المحلي.');
  };

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ]),
    );

    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 3400, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 3400, useNativeDriver: true }),
      ]),
    );

    glowLoop.start();
    driftLoop.start();

    return () => {
      glowLoop.stop();
      driftLoop.stop();
      glow.stopAnimation();
      drift.stopAnimation();
    };
  }, [drift, glow]);

  const sheetActions = useMemo(
    () => [
      {
        label: 'صوّر حاجة',
        iconName: 'camera-outline' as const,
        description: 'التقط صورة محلية محفوظة على جهازك.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void captureImage();
        },
      },
      {
        label: 'ارفع صور',
        iconName: 'images-outline' as const,
        description: 'اختار صورة أو أكثر من جهازك.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void pickImages();
        },
      },
      {
        label: 'ارفع فيديو',
        iconName: 'videocam-outline' as const,
        description: 'اختَر فيديو محلي للدولاب.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          void pickVideo();
        },
      },
      {
        label: 'اكتب ملاحظة',
        iconName: 'document-text-outline' as const,
        description: 'سجّل فكرة تبادل أو وصف سريع.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          setInlineFeedback('ملاحظات الدولاب في PR لاحق.');
        },
      },
      {
        label: 'سجل صوت',
        iconName: 'mic-outline' as const,
        description: 'احفظ ملاحظة صوتية لنفسك لاحقًا.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          setInlineFeedback('تسجيل الصوت في PR لاحق.');
        },
      },
      {
        label: 'مسودة عنصر',
        iconName: 'cube-outline' as const,
        description: 'ابدأ عنصرًا يتحول لاحقًا لعرض.',
        onPress: () => {
          addSheetRef.current?.dismiss();
          setInlineFeedback('مسودة العنصر في PR لاحق.');
        },
      },
    ],
    [],
  );

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>{/* ...existing header unchanged style */}
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="الرجوع من شاشة دولاب تسوى"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
          <AppText weight="bold" style={styles.headerTitle}>
            دولاب تسوى
          </AppText>
        </View>

        <LinearGradient colors={['#FFF8EE', '#F4EDE4', '#F2F7F6']} style={styles.hero}>{/* ... */}
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
          <View style={styles.heroBadge}><AppText weight="semibold" style={styles.heroBadgeText}>نسخة أولى</AppText></View>
          <AppText weight="bold" style={styles.heroTitle}>دولاب تسوى</AppText>
          <AppText muted style={styles.heroSubtitle}>مكانك الخاص لتجميع الصور، الفيديوهات، الأفكار، والحاجات اللي ممكن تتحول لتبادل.</AppText>
        </LinearGradient>

        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">ميديا جاهزة للحفظ</AppText>
            <AppText muted>لسه محلية على جهازك، والحفظ السحابي هييجي في الخطوة الجاية.</AppText>
            <AppText muted style={styles.smallText}>عدد العناصر: {pendingMedia.length}</AppText>
          </View>
          {pendingMedia.length === 0 ? (
            <AppText muted style={styles.smallText}>لسه ما أضفتش ميديا محلية.</AppText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingRow}>
              {pendingMedia.map((item) => (
                <View key={item.id} style={styles.pendingCard}>
                  {item.mediaType === 'image' ? (
                    <Image source={{ uri: item.uri }} style={styles.pendingImage} />
                  ) : (
                    <View style={styles.pendingPlaceholder}>
                      <Ionicons name={item.mediaType === 'video' ? 'videocam-outline' : 'mic-outline'} size={20} color={colors.primary} />
                      <AppText style={styles.smallText}>{item.durationMs ? `${Math.round(item.durationMs / 1000)}ث` : 'بدون مدة'}</AppText>
                    </View>
                  )}
                  <Pressable
                    style={styles.removeButton}
                    accessibilityRole="button"
                    accessibilityLabel="حذف عنصر ميديا من قائمة الدولاب"
                    onPress={() => setPendingMedia((prev) => prev.filter((m) => m.id !== item.id))}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </AppCard>

        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">جاهز يتحول لعرض</AppText>
            <AppText muted>مسودات جاهزة لخطوة السوق لاحقًا.</AppText>
          </View>
          <View style={styles.listWrap}>
            {draftItems.map((item) => (
              <View key={item.id} style={styles.rowCard}>
                <Ionicons name="cube-outline" size={18} color={colors.primary} />
                <View style={styles.rowCopy}>
                  <AppText weight="semibold">{item.title}</AppText>
                  <AppText muted style={styles.smallText}>
                    {item.hint}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard>
          <View style={styles.sectionHeader}>
            <AppText weight="bold">أفكار التبادل</AppText>
            <AppText muted>ملاحظات خاصة تُجهّز صفقات أذكى.</AppText>
          </View>
          <View style={styles.listWrap}>
            {exchangeIdeas.map((idea) => (
              <View key={idea.id} style={styles.noteCard}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                <AppText>{idea.text}</AppText>
              </View>
            ))}
          </View>
        </AppCard>

        <AppCard>
          <EmptyState
            title="المساحة الفارغة جاهزة لك"
            description="عند ربط البيانات الحقيقية، ستظهر هنا العناصر والميديا والأفكار الجديدة."
            iconName="folder-open-outline"
          />
          <AppButton label="ابدأ الإضافة الآن" variant="neutral" onPress={() => addSheetRef.current?.present()} />
        </AppCard>

        <View style={styles.ctaWrap}>
          <AppButton label="أضف للدولاب" onPress={() => addSheetRef.current?.present()} />
          <AppText muted style={styles.feedbackText}>{inlineFeedback ?? 'اختَر طريقة البداية، والباقي قريبًا.'}</AppText>
        </View>
      </ScrollView>

      <AppActionSheet
        ref={addSheetRef}
        title="أضف حاجة للدولاب"
        description="ابدأ بصورة، فيديو، ملاحظة، أو مسودة تبادل."
        titleIconName="add-circle-outline"
        snapPoints={['52%']}
        actions={sheetActions}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  headerTitle: { fontSize: 22 },
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
  heroBadgeText: { color: '#7B5230', fontSize: 12 },
  heroTitle: { fontSize: 28 },
  heroSubtitle: { lineHeight: 23 },
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
  chipText: { fontSize: 12 },
  sectionHeader: { gap: 3, marginBottom: spacing.xs },
  listWrap: { gap: spacing.xs },
  rowCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: '#FFFDF9',
  },
  rowCopy: { flex: 1, gap: 2 },
  smallText: { fontSize: 12 },
  noteCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm,
    backgroundColor: '#FFFEFC',
  },
  pendingRow: { gap: spacing.sm },
  pendingCard: {
    width: 124,
    height: 124,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: '#FFFDF9',
  },
  pendingImage: { width: '100%', height: '100%' },
  pendingPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  removeButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: radii.round,
  },
  ctaWrap: { gap: spacing.xs, marginBottom: spacing.md },
  feedbackText: { textAlign: 'center' },
});
