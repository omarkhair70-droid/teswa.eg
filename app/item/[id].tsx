import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
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


function formatDuration(durationMs: number | null): string | null {
  if (durationMs == null) return null;
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${seconds} ثانية`;
}

function ItemVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return <VideoView style={styles.teaserVideo} player={player} nativeControls fullscreenOptions={{ enable: true }} allowsPictureInPicture={false} />;
}

function ItemVideoTeaserSection({ teaser, active, onPlay }: { teaser: ItemVideoTeaser; active: boolean; onPlay: () => void }) {
  const durationLabel = formatDuration(teaser.durationMs);

  return (
    <Animated.View entering={FadeInDown.duration(220).delay(85)}>
      <AppCard>
        <View style={styles.videoSection}>
          <View style={styles.videoHeaderRow}>
            <View style={styles.videoTitleBlock}>
              <AppText weight="bold">لمحة فيديو</AppText>
              <AppText muted>شوف العنصر في لقطة قصيرة قبل ما تبدأ التبديل.</AppText>
            </View>
            {durationLabel ? <View style={styles.videoDurationPill}><AppText style={styles.videoDurationText}>{durationLabel}</AppText></View> : null}
          </View>

          {active && teaser.signedVideoUrl ? (
            <ItemVideoPlayer uri={teaser.signedVideoUrl} />
          ) : (
            <Pressable style={styles.videoPreviewCard} onPress={onPlay} accessibilityRole="button" accessibilityLabel="تشغيل لمحة فيديو العنصر">
              <View style={styles.videoPreviewGlow} />
              <View style={styles.videoPreviewContent}>
                <View style={styles.videoPlayButton}><AppText weight="bold" style={styles.videoPlayIcon}>▶</AppText></View>
                <View style={styles.videoPreviewTextBlock}>
                  <AppText weight="semibold" style={styles.videoPreviewTitle}>اضغط لتشغيل اللمحة</AppText>
                  <AppText style={styles.videoPreviewSubtitle}>تشغيل عند الطلب فقط — بدون تشغيل تلقائي.</AppText>
                </View>
              </View>
            </Pressable>
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
    } catch {
      // Ignore cache failures and continue with network source of truth.
    }

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
      } catch {
        // Ignore cache failures and preserve hard error fallback.
      }

      setError('تعذر تحميل تفاصيل العنصر. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const handleShareItem = useCallback(async () => {
    if (!item) return;

    setShareError(null);

    try {
      await shareMarketplaceItem({ id: item.id, title: item.title });
    } catch {
      setShareError('تعذر فتح المشاركة حالياً. حاول مرة أخرى.');
    }
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

  const desireModeLabel = item?.desireMode
    ? { specific: 'محدد', flexible: 'مرن', surprise: 'مفاجأة' }[item.desireMode]
    : null;

  if (!id) {
    return <AppScreen><EmptyState title="معرّف غير صالح" description="تعذر تحديد العنصر المطلوب." /></AppScreen>;
  }

  if (loading) {
    return <AppScreen><EmptyState title="جاري التحميل" description="نقوم بتحضير تفاصيل العنصر." /></AppScreen>;
  }

  if (error) {
    return <AppScreen><View style={styles.stateBox}><EmptyState title="خطأ في التحميل" description={error} /><AppButton label="إعادة المحاولة" onPress={loadItem} /></View></AppScreen>;
  }

  if (!item) {
    return <AppScreen><EmptyState title="العنصر غير موجود" description="قد يكون تم حذفه أو لم يعد متاحاً." /></AppScreen>;
  }

  return (
    <AppScreen scrollable>
      <Animated.View entering={FadeInDown.duration(220).delay(40)}>
        {activeImage ? (
          <ExpoImage source={{ uri: activeImage }} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        ) : (
          <View style={[styles.hero, styles.placeholder]}>
            <AppText muted weight="semibold">لا توجد صورة لهذا العنصر</AppText>
          </View>
        )}
        {!!item.images.length && (
          <View style={styles.imageCounter}>
            <AppText style={styles.imageCounterText}>{`${Math.min(activeImageIndex + 1, item.images.length)} من ${item.images.length}`}</AppText>
          </View>
        )}
        {item.images.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsRow}>
            {item.images.map((image, index) => (
              <Pressable
                key={`${image.imageUrl}-${index}`}
                onPress={() => setActiveImageIndex(index)}
                style={[styles.thumbPressable, index === activeImageIndex && styles.thumbActive]}>
                <ExpoImage source={{ uri: image.imageUrl }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </Animated.View>

      {item.videoTeaser ? (
        <ItemVideoTeaserSection teaser={item.videoTeaser} active={videoTeaserActive} onPlay={() => setVideoTeaserActive(true)} />
      ) : null}

      {itemCacheNotice ? (
        <Animated.View entering={FadeInDown.duration(220).delay(80)}>
          <AppCard>
            <AppText muted>{itemCacheNotice}</AppText>
          </AppCard>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(220).delay(90)}>
        <AppCard>
          <View style={styles.infoBlock}>
            <AppText weight="bold" style={styles.title}>{item.title}</AppText>
            {!!item.ownerDisplayName && <AppText muted>صاحب العنصر: {item.ownerDisplayName}</AppText>}
            <AppText muted>الفئة: {item.category || 'غير محددة'}</AppText>
            <AppText muted>الحالة: {item.condition || 'غير محددة'}</AppText>
            <AppText muted>الموقع: {locationText}</AppText>
            {item.description ? <AppText>{item.description}</AppText> : null}
          </View>
        </AppCard>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(220).delay(140)}>
        <AppCard><View style={styles.infoBlock}><AppText weight="semibold">حالة العنصر</AppText><AppText>{item.condition || 'غير محددة'}</AppText>{item.conditionNotes ? <AppText muted>{item.conditionNotes}</AppText> : null}</View></AppCard>
      </Animated.View>

      {item.itemStory ? <Animated.View entering={FadeInDown.duration(220).delay(170)}><AppCard><View style={styles.infoBlock}><AppText weight="semibold">قصة العنصر</AppText><AppText>{item.itemStory}</AppText></View></AppCard></Animated.View> : null}
      {item.swapReason ? <Animated.View entering={FadeInDown.duration(220).delay(190)}><AppCard><View style={styles.infoBlock}><AppText weight="semibold">ليه صاحبه بيبدله</AppText><AppText>{item.swapReason}</AppText></View></AppCard></Animated.View> : null}
      {item.goodFor ? <Animated.View entering={FadeInDown.duration(220).delay(210)}><AppCard><View style={styles.infoBlock}><AppText weight="semibold">مفيد لمين</AppText><AppText>{item.goodFor}</AppText></View></AppCard></Animated.View> : null}

      {(desireModeLabel || item.desireText) ? <Animated.View entering={FadeInDown.duration(220).delay(230)}><AppCard><View style={styles.infoBlock}><AppText weight="semibold">المقابل المطلوب</AppText>{desireModeLabel ? <AppText muted>النمط: {desireModeLabel}</AppText> : null}{item.desireText ? <AppText>{item.desireText}</AppText> : null}</View></AppCard></Animated.View> : null}

      {item.wantedTags.length ? (
        <Animated.View entering={FadeInDown.duration(220).delay(250)}>
          <AppCard>
            <View style={styles.infoBlock}>
              <AppText weight="semibold">وسوم مطلوبة</AppText>
              <View style={styles.tagsWrap}>
                {item.wantedTags.map((tag) => (
                  <View key={tag} style={styles.tagPill}>
                    <AppText style={styles.tagText}>{tag}</AppText>
                  </View>
                ))}
              </View>
            </View>
          </AppCard>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(220).delay(190)} style={styles.ctaBox}>
        <AppButton label="اعرض تبديل" onPress={() => router.push(`/offer/create/${item.id}`)} />
        <AppButton label="مشاركة العنصر" variant="neutral" onPress={handleShareItem} disabled={!item} />
        {shareError ? <AppText style={styles.shareErrorText}>{shareError}</AppText> : null}
      </Animated.View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 240, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  imageCounter: { position: 'absolute', bottom: spacing.sm, left: spacing.sm, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  imageCounterText: { color: colors.white, fontSize: 12 },
  thumbsRow: { gap: spacing.sm, paddingTop: spacing.sm },
  thumbPressable: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 2 },
  thumbActive: { borderColor: colors.primary },
  thumb: { width: 72, height: 72, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  placeholder: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  videoSection: { gap: spacing.sm },
  videoHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  videoTitleBlock: { flex: 1, gap: 2 },
  videoDurationPill: { borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.primarySoft },
  videoDurationText: { color: colors.primary, fontSize: 12 },
  videoPreviewCard: { minHeight: 150, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.primary, justifyContent: 'center' },
  videoPreviewGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.accent, opacity: 0.32 },
  videoPreviewContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  videoPlayButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  videoPlayIcon: { color: colors.primary, fontSize: 20 },
  videoPreviewTextBlock: { flex: 1, gap: spacing.xs },
  videoPreviewTitle: { color: colors.surface, fontSize: 18 },
  videoPreviewSubtitle: { color: colors.surface },
  teaserVideo: { width: '100%', height: 220, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.background },
  title: { fontSize: 24 },
  infoBlock: { gap: spacing.sm },
  ctaBox: { marginTop: spacing.sm, gap: spacing.sm },
  stateBox: { gap: spacing.md },
  shareErrorText: { color: colors.primary },
  tagsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  tagPill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  tagText: { fontSize: 12 },
});
