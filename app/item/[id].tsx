import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { fetchMarketplaceItemDetailById, MarketplaceItemDetail } from '@/lib/marketplace-items';
import type { ItemVideoTeaser } from '@/lib/item-videos';
import { shareMarketplaceItem } from '@/lib/share-item';
import {
  deleteItemDetailCache,
  readAnyItemDetailCache,
  readFreshItemDetailCache,
  writeItemDetailCache,
} from '@/lib/offline-item-detail-cache';
import { buildCachedVideoSource, prefetchImagesMemoryDisk } from '@/lib/media/media-performance';

function formatDuration(durationMs: number | null): string | null {
  if (durationMs == null) return null;
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${seconds} ثانية`;
}

function ItemVideoPlayer({ uri }: { uri: string }) {
  const source = buildCachedVideoSource(uri);
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return <VideoView style={styles.teaserVideo} player={player} nativeControls fullscreenOptions={{ enable: true }} allowsPictureInPicture={false} />;
}

function ItemVideoTeaserSection({ teaser, active, onPlay }: { teaser: ItemVideoTeaser; active: boolean; onPlay: () => void }) {
  const durationLabel = formatDuration(teaser.durationMs);

  return (
    <Animated.View entering={FadeInDown.duration(220).delay(85)}>
      <AppCard style={styles.premiumCard}>
        <View style={styles.videoSection}>
          <View style={styles.videoHeaderRow}>
            <View style={styles.videoTitleBlock}>
              <View style={styles.sectionEyebrowRow}>
                <Ionicons name="videocam-outline" size={16} color={colors.primary} />
                <AppText muted style={styles.sectionEyebrow}>لمحة مرئية</AppText>
              </View>
              <AppText weight="bold">لمحة فيديو</AppText>
              <AppText muted>شوف العنصر في لقطة قصيرة قبل ما تبدأ التبديل.</AppText>
            </View>
            {durationLabel ? <View style={styles.videoDurationPill}><AppText style={styles.videoDurationText}>{durationLabel}</AppText></View> : null}
          </View>

          {teaser.signedVideoUrl ? active ? (
            <ItemVideoPlayer uri={teaser.signedVideoUrl} />
          ) : (
            <Pressable style={styles.videoPreviewCard} onPress={onPlay} accessibilityRole="button" accessibilityLabel="تشغيل لمحة فيديو العنصر">
              <View style={styles.videoPreviewGlow} />
              <View style={styles.videoPreviewContent}>
                <View style={styles.videoPlayButton}><Ionicons name="play" size={24} color={colors.primary} /></View>
                <View style={styles.videoPreviewTextBlock}>
                  <AppText weight="semibold" style={styles.videoPreviewTitle}>اضغط لتشغيل اللمحة</AppText>
                  <AppText style={styles.videoPreviewSubtitle}>تشغيل عند الطلب فقط — بدون تشغيل تلقائي.</AppText>
                </View>
              </View>
            </Pressable>
          ) : (
            <View style={[styles.videoPreviewCard, styles.videoUnavailableCard]}>
              <View style={styles.videoPreviewContent}>
                <View style={[styles.videoPlayButton, styles.videoUnavailableIcon]}><Ionicons name="alert-circle-outline" size={22} color={colors.primary} /></View>
                <View style={styles.videoPreviewTextBlock}>
                  <AppText weight="semibold" style={styles.videoUnavailableTitle}>تعذر تجهيز فيديو اللمحة الآن.</AppText>
                  <AppText style={styles.videoUnavailableSubtitle}>جرّب فتح العنصر مرة أخرى بعد قليل.</AppText>
                </View>
              </View>
            </View>
          )}
        </View>
      </AppCard>
    </Animated.View>
  );
}

export default function ItemDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<MarketplaceItemDetail | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [itemCacheNotice, setItemCacheNotice] = useState<string | null>(null);
  const [videoTeaserActive, setVideoTeaserActive] = useState(false);

  const loadItem = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setItemCacheNotice(null);
    let hasFreshCachedItem = false;
    try {
      const cached = await readFreshItemDetailCache(id);
      if (cached) {
        hasFreshCachedItem = true;
        setItem(cached.item);
        setActiveImageIndex(0);
        setVideoTeaserActive(false);
        setLoading(false);
        setItemCacheNotice('نستعرض تفاصيل محفوظة بينما نتحقق من الأحدث.');
      }
    } catch {}
    try {
      const result = await fetchMarketplaceItemDetailById(id);
      if (result) {
        setItem(result);
        setActiveImageIndex(0);
        setVideoTeaserActive(false);
        setError(null);
        setItemCacheNotice(null);
        void writeItemDetailCache(id, result);
        return;
      }
      setItem(null);
      setItemCacheNotice(null);
      void deleteItemDetailCache(id);
    } catch {
      if (hasFreshCachedItem) {
        setError(null);
        setItemCacheNotice('تعذر تحديث التفاصيل الآن، نعرض آخر نسخة محفوظة.');
        return;
      }
      try {
        const stale = await readAnyItemDetailCache(id);
        if (stale) {
          setItem(stale.item);
          setActiveImageIndex(0);
          setVideoTeaserActive(false);
          setError(null);
          setItemCacheNotice('أنت ترى نسخة محفوظة من تفاصيل العنصر. سنحدّثها عندما يتحسن الاتصال.');
          return;
        }
      } catch {}
      setError('تعذر تحميل تفاصيل العنصر. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadItem(); }, [loadItem]);
  useEffect(() => {
    if (!item?.id) return;
    if (!item.images.length) return;
    void prefetchImagesMemoryDisk(item.images.map((image) => image.imageUrl));
  }, [item?.id, item?.images]);

  const handleShareItem = useCallback(async () => {
    if (!item) return;
    setShareError(null);
    try { await shareMarketplaceItem({ id: item.id, title: item.title }); } catch { setShareError('تعذر فتح المشاركة حالياً. حاول مرة أخرى.'); }
  }, [item]);

  const activeImage = useMemo(() => {
    if (!item?.images.length) return item?.imageUrl ?? null;
    return item.images[activeImageIndex]?.imageUrl ?? item.images[0].imageUrl;
  }, [activeImageIndex, item]);

  const locationText = useMemo(() => {
    if (!item) return 'غير محدد';
    if (item.location && item.area) return `${item.location} • ${item.area}`;
    return item.location || item.area || 'غير محدد';
  }, [item]);

  const desireModeLabel = item?.desireMode ? { specific: 'محدد', flexible: 'مرن', surprise: 'مفاجأة' }[item.desireMode] : null;
  const owner = item?.ownerPresence;

  if (!id) return <AppScreen backgroundVariant="soft"><EmptyState title="معرّف غير صالح" description="تعذر تحديد العنصر المطلوب." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="جاري التحميل" description="نقوم بتحضير تفاصيل العنصر." /></AppScreen>;
  if (error) return <AppScreen backgroundVariant="soft"><View style={styles.stateBox}><EmptyState title="خطأ في التحميل" description={error} /><AppButton label="إعادة المحاولة" onPress={loadItem} /></View></AppScreen>;
  if (!item) return <AppScreen backgroundVariant="soft"><EmptyState title="العنصر غير موجود" description="قد يكون تم حذفه أو لم يعد متاحاً." /></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <Animated.View entering={FadeInDown.duration(220).delay(40)}>
        <View style={styles.heroShell}>
          {activeImage ? <ExpoImage source={{ uri: activeImage }} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" transition={200} /> : <View style={[styles.hero, styles.placeholder]}><Ionicons name="image-outline" size={22} color={colors.textMuted} /><AppText muted weight="semibold">الصورة غير متاحة</AppText></View>}
          {!!item.images.length && <View style={styles.imageCounter}><AppText style={styles.imageCounterText}>{`${Math.min(activeImageIndex + 1, item.images.length)} من ${item.images.length}`}</AppText></View>}
          {(item.hasVideoTeaser || item.videoTeaser) ? <View style={styles.mediaCue}><Ionicons name="videocam-outline" size={12} color={colors.white} /><AppText style={styles.mediaCueText}>فيه لمحة فيديو</AppText></View> : null}
        </View>
        {item.images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsRow}>{item.images.map((image, index) => <Pressable key={`${image.imageUrl}-${index}`} onPress={() => setActiveImageIndex(index)} style={[styles.thumbPressable, index === activeImageIndex && styles.thumbActive]}><ExpoImage source={{ uri: image.imageUrl }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={120} /></Pressable>)}</ScrollView> : null}
      </Animated.View>

      {item.videoTeaser ? <ItemVideoTeaserSection teaser={item.videoTeaser} active={videoTeaserActive} onPlay={() => setVideoTeaserActive(true)} /> : null}

      {itemCacheNotice ? <Animated.View entering={FadeInDown.duration(220).delay(80)}><AppCard style={styles.noticeCard}><View style={styles.noticeRow}><Ionicons name="cloud-offline-outline" size={16} color={colors.primary} /><AppText muted style={styles.noticeText}>{itemCacheNotice}</AppText></View></AppCard></Animated.View> : null}

      <Animated.View entering={FadeInDown.duration(220).delay(90)}>
        <AppCard style={styles.premiumCard}><View style={styles.infoBlock}><AppText weight="bold" style={styles.title}>{item.title}</AppText>
          <View style={styles.metaRow}><View style={styles.metaPill}><Ionicons name="pricetag-outline" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.category || 'فئة غير محددة'}</AppText></View><View style={styles.metaPill}><Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.condition || 'حالة غير محددة'}</AppText></View><View style={styles.metaPill}><Ionicons name="location-outline" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{locationText}</AppText></View></View>
          {!owner && !!item.ownerDisplayName ? <AppText muted>صاحب العنصر: {item.ownerDisplayName}</AppText> : null}
          {item.description ? <AppText>{item.description}</AppText> : null}
        </View></AppCard>
      </Animated.View>

      {owner?.id ? <Animated.View entering={FadeInDown.duration(220).delay(110)}><Pressable onPress={() => router.push(`/profile/${owner.id}`)}><AppCard style={styles.ownerCard}><View style={styles.ownerHeader}><AppText muted>صاحب العنصر</AppText><Ionicons name="chevron-back" size={16} color={colors.textMuted} /></View><View style={styles.ownerMain}>{owner.avatarUrl ? (
                <ExpoImage source={{ uri: owner.avatarUrl }} style={styles.avatarImage} contentFit="cover" transition={120} cachePolicy="memory-disk" />
              ) : (
                <View style={styles.avatar}><AppText weight="bold" style={styles.avatarText}>{(owner.displayName?.[0] || owner.username?.[0] || '؟').toUpperCase()}</AppText></View>
              )}<View style={styles.ownerTextBlock}><AppText weight="bold">{owner.displayName || 'صاحب العنصر'}</AppText>{owner.username ? <AppText muted>@{owner.username}</AppText> : null}{owner.profileTagline ? <AppText muted>{owner.profileTagline}</AppText> : null}</View></View>{(owner.city || owner.area) ? <AppText muted>{[owner.city, owner.area].filter(Boolean).join(' • ')}</AppText> : null}<View style={styles.ownerSignals}>{owner.successfulSwapsCount != null ? <View style={styles.signalPill}><Ionicons name="swap-horizontal-outline" size={12} color={colors.primary} /><AppText style={styles.signalText}>{owner.successfulSwapsCount} مقايضات ناجحة</AppText></View> : null}{owner.responseRate != null ? <View style={styles.signalPill}><Ionicons name="flash-outline" size={12} color={colors.primary} /><AppText style={styles.signalText}>{owner.responseRate}% معدل الرد</AppText></View> : null}</View></AppCard></Pressable></Animated.View> : null}

      <Animated.View entering={FadeInDown.duration(220).delay(140)}><AppCard style={styles.storyCard}><View style={styles.storyHeader}><Ionicons name="sparkles-outline" size={16} color={colors.primary} /><AppText weight="semibold">حالة العنصر</AppText></View><View style={styles.infoBlock}><AppText>{item.condition || 'غير محددة'}</AppText>{item.conditionNotes ? <AppText muted>{item.conditionNotes}</AppText> : null}</View></AppCard></Animated.View>
      {item.itemStory ? <Animated.View entering={FadeInDown.duration(220).delay(170)}><AppCard style={styles.storyCard}><View style={styles.storyHeader}><Ionicons name="book-outline" size={16} color={colors.primary} /><AppText weight="semibold">قصة العنصر</AppText></View><AppText>{item.itemStory}</AppText></AppCard></Animated.View> : null}
      {item.swapReason ? <Animated.View entering={FadeInDown.duration(220).delay(190)}><AppCard style={styles.storyCard}><View style={styles.storyHeader}><Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} /><AppText weight="semibold">ليه صاحبه بيبدله</AppText></View><AppText>{item.swapReason}</AppText></AppCard></Animated.View> : null}
      {item.goodFor ? <Animated.View entering={FadeInDown.duration(220).delay(210)}><AppCard style={styles.storyCard}><View style={styles.storyHeader}><Ionicons name="people-outline" size={16} color={colors.primary} /><AppText weight="semibold">مفيد لمين</AppText></View><AppText>{item.goodFor}</AppText></AppCard></Animated.View> : null}
      {(desireModeLabel || item.desireText) ? <Animated.View entering={FadeInDown.duration(220).delay(230)}><AppCard style={styles.storyCard}><View style={styles.storyHeader}><Ionicons name="compass-outline" size={16} color={colors.primary} /><AppText weight="semibold">المقابل المطلوب</AppText></View>{desireModeLabel ? <AppText muted>النمط: {desireModeLabel}</AppText> : null}{item.desireText ? <AppText>{item.desireText}</AppText> : null}</AppCard></Animated.View> : null}
      {item.wantedTags.length ? <Animated.View entering={FadeInDown.duration(220).delay(250)}><AppCard style={styles.storyCard}><View style={styles.storyHeader}><Ionicons name="pricetag-outline" size={16} color={colors.primary} /><AppText weight="semibold">وسوم مطلوبة</AppText></View><View style={styles.tagsWrap}>{item.wantedTags.map((tag) => <View key={tag} style={styles.tagPill}><AppText style={styles.tagText}>{tag}</AppText></View>)}</View></AppCard></Animated.View> : null}

      <Animated.View entering={FadeInDown.duration(220).delay(190)} style={styles.ctaPanel}><AppText muted>لو العنصر مناسبك، افتح عرض تبديل من هنا.</AppText><AppButton label="اعرض تبديل" onPress={() => router.push(`/offer/create/${item.id}`)} /><AppButton label="مشاركة العنصر" variant="neutral" onPress={handleShareItem} disabled={!item} /><AppButton label="الإبلاغ عن العنصر" variant="neutral" onPress={() => router.push(`/report/item/${item.id}`)} />{shareError ? <AppText style={styles.shareErrorText}>{shareError}</AppText> : null}</Animated.View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroShell: { borderRadius: radii.xl, padding: spacing.xs, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  hero: { width: '100%', height: 252, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  placeholder: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: spacing.xs },
  imageCounter: { position: 'absolute', bottom: spacing.sm, left: spacing.sm, backgroundColor: 'rgba(25,20,45,0.6)', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  imageCounterText: { color: colors.white, fontSize: 12 },
  mediaCue: { position: 'absolute', top: spacing.sm, right: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  mediaCueText: { color: colors.white, fontSize: 11 },
  thumbsRow: { gap: spacing.sm, paddingTop: spacing.sm },
  thumbPressable: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 3, backgroundColor: colors.surface, shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  thumbActive: { borderColor: colors.primary, borderWidth: 2 },
  thumb: { width: 74, height: 74, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  premiumCard: { borderWidth: 1, borderColor: colors.border },
  sectionEyebrowRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  sectionEyebrow: { fontSize: 11 },
  videoSection: { gap: spacing.sm },
  videoHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  videoTitleBlock: { flex: 1, gap: 2 },
  videoDurationPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  videoDurationText: { color: colors.primary, fontSize: 12 },
  videoPreviewCard: { minHeight: 150, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.primary, justifyContent: 'center' },
  videoPreviewGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.accent, opacity: 0.32 },
  videoPreviewContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  videoPlayButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  videoPreviewTextBlock: { flex: 1, gap: spacing.xs },
  videoPreviewTitle: { color: colors.surface, fontSize: 18 },
  videoPreviewSubtitle: { color: colors.surface },
  videoUnavailableCard: { backgroundColor: colors.primarySoft },
  videoUnavailableIcon: { backgroundColor: colors.surface },
  videoUnavailableTitle: { color: colors.text, fontSize: 18 },
  videoUnavailableSubtitle: { color: colors.textMuted },
  teaserVideo: { width: '100%', height: 220, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.background },
  noticeCard: { borderWidth: 1, borderColor: colors.border },
  noticeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  noticeText: { flex: 1 },
  title: { fontSize: 26 },
  infoBlock: { gap: spacing.sm },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  metaPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  metaText: { fontSize: 12 },
  ownerCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  ownerHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  ownerMain: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primary },
  ownerTextBlock: { flex: 1, gap: 2 },
  ownerSignals: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  signalPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  signalText: { fontSize: 12 },
  storyCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  storyHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  tagsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  tagPill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  tagText: { fontSize: 12 },
  ctaPanel: { marginTop: spacing.sm, gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.72)' },
  stateBox: { gap: spacing.md },
  shareErrorText: { color: colors.primary },
});
