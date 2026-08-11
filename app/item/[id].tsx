import { type ElementRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { ItemVideoTeaser } from '@/lib/item-videos';
import { shareMarketplaceItem } from '@/lib/share-item';
import { shareMarketplaceItemCard } from '@/lib/share-item-card';
import { ItemShareCard } from '@/components/share/ItemShareCard';
import { buildCachedVideoSource, prefetchImagesMemoryDisk } from '@/lib/media/media-performance';
import { trackEvent } from '@/lib/analytics';
import { trackPerformanceMetric } from '@/lib/performance-telemetry';
import { useItemDetailQuery } from '@/lib/query/use-item-detail-query';
import { useAuth } from '@/lib/auth';
import { setItemLiked } from '@/lib/item-likes';
import { AppActionSheet } from '@/components/sheets/AppActionSheet';

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

function ItemDetailLoadingState() {
  return (
    <AppScreen scrollable backgroundVariant="soft">
      <View style={styles.detailLoadingShell}>
        <View style={[styles.hero, styles.detailSkeletonBlock]} />
        <AppCard style={styles.premiumCard}>
          <View style={styles.detailLoadingCopy}>
            <View style={styles.detailSkeletonTitle} />
            <View style={styles.detailSkeletonLine} />
            <View style={[styles.detailSkeletonLine, styles.detailSkeletonLineShort]} />
          </View>
        </AppCard>
        <AppCard style={styles.premiumCard}>
          <View style={styles.noticeRow}>
            <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
            <AppText muted style={styles.noticeText}>بنحضر تفاصيل العنصر والصور بأهدى شكل ممكن...</AppText>
          </View>
        </AppCard>
      </View>
    </AppScreen>
  );
}

function ItemDetailErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <AppScreen backgroundVariant="soft">
      <View style={styles.stateBox}>
        <EmptyState title="تعذر فتح العنصر" description={message} />
        <AppButton label="إعادة المحاولة" onPress={onRetry} />
      </View>
    </AppScreen>
  );
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
  const { id, moment } = useLocalSearchParams<{ id: string; moment?: string }>();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const [shareError, setShareError] = useState<string | null>(null);
  const [itemCacheNotice, setItemCacheNotice] = useState<string | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [videoTeaserActive, setVideoTeaserActive] = useState(false);
  const trackedItemDetailRef = useRef<string | null>(null);
  const itemDetailStartedAtRef = useRef(Date.now());
  const itemDetailMetricSentRef = useRef<string | null>(null);
  const itemShareCardRef = useRef<ElementRef<typeof ViewShot> | null>(null);
  const itemActionsSheetRef = useRef<BottomSheetModal>(null);
  const { user } = useAuth();
  const itemDetailQuery = useItemDetailQuery(id, user?.id ?? null);
  const item = itemDetailQuery.data?.item ?? null;
  const loading = itemDetailQuery.isLoading;
  const error = itemDetailQuery.error instanceof Error ? itemDetailQuery.error.message : null;



  useEffect(() => {
    setItemCacheNotice(itemDetailQuery.data?.notice ?? null);
  }, [itemDetailQuery.data?.notice]);

  useEffect(() => {
    setActiveImageIndex(0);
    setVideoTeaserActive(false);
    itemDetailStartedAtRef.current = Date.now();
  }, [id]);

  useEffect(() => {
    if (!item?.id) return;
    if (itemDetailMetricSentRef.current !== item.id) {
      itemDetailMetricSentRef.current = item.id;
      void trackPerformanceMetric('item_detail_first_content_time', Date.now() - itemDetailStartedAtRef.current, {
        route: '/item/[id]',
        cacheHit: itemDetailQuery.data?.source !== 'network',
      });
    }
    if (!item.images.length) return;
    void prefetchImagesMemoryDisk(item.images.map((image) => image.imageUrl));
  }, [item?.id, item?.images, itemDetailQuery.data?.source]);

  useEffect(() => {
    if (!item?.id) return;
    if (trackedItemDetailRef.current === item.id) return;

    trackedItemDetailRef.current = item.id;
    void trackEvent('item_detail_viewed', {
      route: '/item/[id]',
      entityType: 'item',
      entityId: item.id,
      metadata: { source: 'detail_screen' },
    });
  }, [item?.id]);

  const onToggleLike = useCallback(async () => {
    if (!item || likePending) return;
    if (!user?.id) {
      router.push('/(auth)/login');
      return;
    }

    setLikePending(true);
    try {
      const result = await setItemLiked({ itemId: item.id, userId: user.id, liked: !item.likedByMe });
      if (result.ok) {
        await itemDetailQuery.refetch();
      }
    } catch {
      // ignore and keep current UI state
    } finally {
      setLikePending(false);
    }
  }, [item, likePending, user?.id, router, itemDetailQuery]);

  const handleShareItem = useCallback(async () => {
    if (!item) return;
    setShareError(null);
    try { await shareMarketplaceItem({ id: item.id, title: item.title }); } catch { setShareError('تعذر فتح المشاركة حالياً. حاول مرة أخرى.'); }
  }, [item]);

  const handleShareItemCard = useCallback(async () => {
    if (!item) return;
    setShareError(null);

    const result = await shareMarketplaceItemCard({
      item: { id: item.id, title: item.title },
      capture: async () => {
        const uri = await itemShareCardRef.current?.capture?.();
        return uri ?? '';
      },
    });

    if (!result.ok) {
      setShareError(result.message);
    }
  }, [item]);

  const activeImage = useMemo(() => {
    if (!item?.images.length) return item?.imageUrl ?? null;
    return item.images[activeImageIndex]?.imageUrl ?? item.images[0].imageUrl;
  }, [activeImageIndex, item]);

  const galleryImages = useMemo(() => {
  if (item?.images.length) {
    return item.images.map((image) => image.imageUrl);
  }

  return item?.imageUrl ? [item.imageUrl] : [];
}, [item]);

  const locationText = useMemo(() => {
    if (!item) return 'غير محدد';
    if (item.location && item.area) return `${item.location} • ${item.area}`;
    return item.location || item.area || 'غير محدد';
  }, [item]);

  const desireModeLabel = item?.desireMode ? { specific: 'محدد', flexible: 'مرن', surprise: 'مفاجأة' }[item.desireMode] : null;
  const owner = item?.ownerPresence;
  const ownedByMe = Boolean(user?.id && owner?.id === user.id);

  if (!id) return <AppScreen backgroundVariant="soft"><EmptyState title="معرّف غير صالح" description="تعذر تحديد العنصر المطلوب." /></AppScreen>;
  if (loading) return <ItemDetailLoadingState />;
  if (error) return <ItemDetailErrorState message={error} onRetry={() => { void itemDetailQuery.refetch(); }} />;
  if (!item) return <AppScreen backgroundVariant="soft"><EmptyState title="العنصر غير موجود" description="قد يكون تم حذفه أو لم يعد متاحاً." /></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.detailTopBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.detailTopIconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.detailTopCopy}>
          <AppText muted style={styles.detailEyebrow}>السوق</AppText>
          <AppText weight="bold">تفاصيل العنصر</AppText>
        </View>
        <View style={styles.detailTopActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.likedByMe ? 'إلغاء الإعجاب' : 'إعجاب'} disabled={likePending} style={styles.detailActionButton} onPress={onToggleLike}>
            <Ionicons name={item.likedByMe ? 'heart' : 'heart-outline'} size={19} color={item.likedByMe ? colors.primary : colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="خيارات العنصر" style={styles.detailActionButton} onPress={() => itemActionsSheetRef.current?.present()}>
            <Ionicons name="ellipsis-horizontal" size={19} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <Animated.View entering={FadeInDown.duration(220).delay(40)}>
        <View style={styles.heroShell}>
          {activeImage ? (
  <Pressable
    onPress={() => setGalleryVisible(true)}
    style={styles.heroPressable}
    accessibilityRole="button"
    accessibilityLabel="فتح صور العنصر بالحجم الكامل"
  >
    <ExpoImage
      source={{ uri: activeImage }}
      style={styles.hero}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
    />

    <View style={styles.expandButton}>
      <Ionicons
        name="expand-outline"
        size={18}
        color={colors.white}
      />
    </View>
  </Pressable>
) : (
  <View style={[styles.hero, styles.placeholder]}>
    <Ionicons
      name="image-outline"
      size={22}
      color={colors.textMuted}
    />
    <AppText muted weight="semibold">
      الصورة غير متاحة
    </AppText>
  </View>
)}
          {!!item.images.length && <View style={styles.imageCounter}><AppText style={styles.imageCounterText}>{`${Math.min(activeImageIndex + 1, item.images.length)} من ${item.images.length}`}</AppText></View>}
          {(item.hasVideoTeaser || item.videoTeaser) ? <View style={styles.mediaCue}><Ionicons name="videocam-outline" size={12} color={colors.white} /><AppText style={styles.mediaCueText}>فيه لمحة فيديو</AppText></View> : null}
        </View>
        {item.images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsRow}>{item.images.map((image, index) => <Pressable key={`${image.imageUrl}-${index}`} onPress={() => setActiveImageIndex(index)} style={[styles.thumbPressable, index === activeImageIndex && styles.thumbActive]}><ExpoImage source={{ uri: image.imageUrl }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={120} /></Pressable>)}</ScrollView> : null}
      </Animated.View>

      {item.videoTeaser ? <ItemVideoTeaserSection teaser={item.videoTeaser} active={videoTeaserActive} onPlay={() => setVideoTeaserActive(true)} /> : null}
      {moment === 'published' ? <Animated.View entering={FadeInDown.duration(220).delay(70)}><AppCard style={styles.noticeCard}><View style={styles.gap8}><AppText weight="bold">عنصرك بقى جاهز للتبادل</AppText><AppText muted>دلوقتي الناس تقدر تشوفه وتبدأ عرض تبديل.</AppText></View></AppCard></Animated.View> : null}

      {itemCacheNotice ? <Animated.View entering={FadeInDown.duration(220).delay(80)}><AppCard style={styles.noticeCard}><View style={styles.noticeRow}><Ionicons name="cloud-offline-outline" size={16} color={colors.primary} /><AppText muted style={styles.noticeText}>{itemCacheNotice}</AppText></View></AppCard></Animated.View> : null}

      <Animated.View entering={FadeInDown.duration(220).delay(90)}>
        <AppCard style={styles.premiumCard}>
          <View style={styles.infoBlock}>
            <View style={styles.titleBlock}>
              <AppText muted style={styles.sectionEyebrow}>متاح للتبادل</AppText>
              <AppText weight="bold" style={styles.title}>{item.title}</AppText>
              {item.description ? <AppText style={styles.descriptionText}>{item.description}</AppText> : null}
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}><Ionicons name="heart-outline" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.likeCount} إعجاب</AppText></View>
              <View style={styles.metaPill}><Ionicons name="pricetag-outline" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.category || 'فئة غير محددة'}</AppText></View>
              <View style={styles.metaPill}><Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.condition || 'حالة غير محددة'}</AppText></View>
              <View style={styles.metaPill}><Ionicons name="location-outline" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{locationText}</AppText></View>
            </View>
            {!owner && !!item.ownerDisplayName ? <AppText muted>صاحب العنصر: {item.ownerDisplayName}</AppText> : null}
            {(desireModeLabel || item.desireText || item.wantedTags.length) ? (
              <View style={styles.desireHighlight}>
                <View style={styles.desireIcon}><Ionicons name="swap-horizontal" size={18} color={colors.primary} /></View>
                <View style={styles.desireCopy}>
                  <AppText weight="semibold">إيه اللي ممكن يناسبه؟</AppText>
                  {item.desireText ? <AppText style={styles.desireText}>{item.desireText}</AppText> : desireModeLabel ? <AppText muted>مرونة التبادل: {desireModeLabel}</AppText> : null}
                  {item.wantedTags.length ? <View style={styles.tagsWrap}>{item.wantedTags.slice(0, 4).map((tag) => <View key={tag} style={styles.tagPill}><AppText style={styles.tagText}>{tag}</AppText></View>)}</View> : null}
                </View>
              </View>
            ) : null}
          </View>
        </AppCard>
      </Animated.View>

      {owner?.id ? <Animated.View entering={FadeInDown.duration(220).delay(110)}><Pressable onPress={() => router.push(`/profile/${owner.id}`)}><AppCard style={styles.ownerCard}><View style={styles.ownerHeader}><AppText muted>صاحب العنصر</AppText><Ionicons name="chevron-back" size={16} color={colors.textMuted} /></View><View style={styles.ownerMain}>{owner.avatarUrl ? (
                <ExpoImage source={{ uri: owner.avatarUrl }} style={styles.avatarImage} contentFit="cover" transition={120} cachePolicy="memory-disk" />
              ) : (
                <View style={styles.avatar}><AppText weight="bold" style={styles.avatarText}>{(owner.displayName?.[0] || owner.username?.[0] || '؟').toUpperCase()}</AppText></View>
              )}<View style={styles.ownerTextBlock}><AppText weight="bold">{owner.displayName || 'صاحب العنصر'}</AppText>{owner.username ? <AppText muted>@{owner.username}</AppText> : null}{owner.profileTagline ? <AppText muted>{owner.profileTagline}</AppText> : null}</View></View>{(owner.city || owner.area) ? <AppText muted>{[owner.city, owner.area].filter(Boolean).join(' • ')}</AppText> : null}<View style={styles.ownerSignals}>{owner.successfulSwapsCount != null ? <View style={styles.signalPill}><Ionicons name="swap-horizontal-outline" size={12} color={colors.primary} /><AppText style={styles.signalText}>{owner.successfulSwapsCount} مقايضات ناجحة</AppText></View> : null}{owner.responseRate != null ? <View style={styles.signalPill}><Ionicons name="flash-outline" size={12} color={colors.primary} /><AppText style={styles.signalText}>{owner.responseRate}% معدل الرد</AppText></View> : null}</View></AppCard></Pressable></Animated.View> : null}

      {(item.condition || item.conditionNotes || item.itemStory || item.swapReason || item.goodFor) ? (
        <Animated.View entering={FadeInDown.duration(220).delay(150)}>
          <AppCard style={styles.storyStackCard}>
            <View style={styles.storyStackHeader}>
              <View style={styles.storyStackIcon}><Ionicons name="reader-outline" size={18} color={colors.primary} /></View>
              <View style={styles.storyStackCopy}>
                <AppText weight="bold">عن العنصر</AppText>
                <AppText muted>الحالة والقصة وسبب التبديل في مكان واحد.</AppText>
              </View>
            </View>
            <View style={styles.storySegments}>
              {(item.condition || item.conditionNotes) ? <View style={styles.storySegment}><View style={styles.storySegmentHead}><Ionicons name="sparkles-outline" size={14} color={colors.primary} /><AppText weight="semibold" style={styles.storySegmentLabel}>الحالة</AppText></View><AppText>{item.condition || 'غير محددة'}</AppText>{item.conditionNotes ? <AppText muted>{item.conditionNotes}</AppText> : null}</View> : null}
              {item.itemStory ? <View style={[styles.storySegment, styles.storySegmentDivider]}><View style={styles.storySegmentHead}><Ionicons name="book-outline" size={14} color={colors.primary} /><AppText weight="semibold" style={styles.storySegmentLabel}>القصة</AppText></View><AppText>{item.itemStory}</AppText></View> : null}
              {item.swapReason ? <View style={[styles.storySegment, styles.storySegmentDivider]}><View style={styles.storySegmentHead}><Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} /><AppText weight="semibold" style={styles.storySegmentLabel}>سبب التبديل</AppText></View><AppText>{item.swapReason}</AppText></View> : null}
              {item.goodFor ? <View style={[styles.storySegment, styles.storySegmentDivider]}><View style={styles.storySegmentHead}><Ionicons name="people-outline" size={14} color={colors.primary} /><AppText weight="semibold" style={styles.storySegmentLabel}>مناسب لمين</AppText></View><AppText>{item.goodFor}</AppText></View> : null}
            </View>
          </AppCard>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(220).delay(190)} style={[styles.ctaPanel, ownedByMe && styles.ownerCtaPanel]}>
        <View style={styles.ctaHeader}>
          <View style={styles.ctaIcon}><Ionicons name={ownedByMe ? 'create-outline' : 'swap-horizontal'} size={20} color={colors.primary} /></View>
          <View style={styles.ctaCopy}>
            <AppText weight="bold" style={styles.ctaTitle}>{ownedByMe ? 'ده عنصرك' : 'شايفه مناسب ليك؟'}</AppText>
            <AppText muted style={styles.ctaHint}>{ownedByMe ? 'راجع ظهوره وعدّل التفاصيل في أي وقت.' : (item.desireText ? `صاحبه بيدور على: ${item.desireText}` : 'اختار حاجة من عندك وابعت عرض واضح ومباشر.')}</AppText>
          </View>
        </View>
        {ownedByMe ? <AppButton label="تعديل العنصر" onPress={() => router.push(`/item/edit/${item.id}`)} /> : <AppButton label="ابدأ عرض تبديل" onPress={() => router.push(`/offer/create/${item.id}`)} />}
        <AppButton label="خيارات العنصر" variant="neutral" onPress={() => itemActionsSheetRef.current?.present()} />
        {shareError ? <AppText style={styles.shareErrorText}>{shareError}</AppText> : null}
      </Animated.View>
      <AppActionSheet
        ref={itemActionsSheetRef}
        title="خيارات العنصر"
        description={ownedByMe ? 'شارك العنصر أو عدّل بياناته.' : 'شارك العنصر أو بلّغ عنه لو فيه مشكلة.'}
        actions={ownedByMe ? [
          {
            label: 'تعديل العنصر',
            onPress: () => {
              itemActionsSheetRef.current?.dismiss();
              router.push(`/item/edit/${item.id}`);
            },
          },
          {
            label: 'مشاركة العنصر',
            onPress: () => {
              itemActionsSheetRef.current?.dismiss();
              void handleShareItem();
            },
          },
          {
            label: 'مشاركة كارت',
            onPress: () => {
              itemActionsSheetRef.current?.dismiss();
              void handleShareItemCard();
            },
          },
        ] : [
          {
            label: 'مشاركة العنصر',
            onPress: () => {
              itemActionsSheetRef.current?.dismiss();
              void handleShareItem();
            },
          },
          {
            label: 'مشاركة كارت',
            onPress: () => {
              itemActionsSheetRef.current?.dismiss();
              void handleShareItemCard();
            },
          },
          {
            label: 'الإبلاغ عن العنصر',
            tone: 'danger' as const,
            onPress: () => {
              itemActionsSheetRef.current?.dismiss();
              router.push(`/report/item/${item.id}`);
            },
          },
        ]}
      />
      <View style={styles.captureNode} pointerEvents="none">
        <ViewShot ref={itemShareCardRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
          <ItemShareCard
            item={{
              title: item.title,
              imageUrl: activeImage,
              category: item.category,
              condition: item.condition,
              location: locationText === 'غير محدد' ? null : locationText,
            }}
          />
        </ViewShot>
      </View>
    <Modal
  visible={galleryVisible}
  animationType="fade"
  statusBarTranslucent
  onRequestClose={() => setGalleryVisible(false)}
>
  <View style={styles.galleryModal}>
    <ScrollView
      key={`gallery-${galleryVisible}-${activeImageIndex}`}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      contentOffset={{
        x: activeImageIndex * screenWidth,
        y: 0,
      }}
      onMomentumScrollEnd={(event) => {
        const nextIndex = Math.round(
          event.nativeEvent.contentOffset.x / screenWidth,
        );

        setActiveImageIndex(
          Math.max(
            0,
            Math.min(nextIndex, galleryImages.length - 1),
          ),
        );
      }}
    >
      {galleryImages.map((imageUrl, index) => (
        <View
          key={`${imageUrl}-${index}`}
          style={[
            styles.galleryPage,
            { width: screenWidth },
          ]}
        >
          <ExpoImage
            source={{ uri: imageUrl }}
            style={styles.galleryImage}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        </View>
      ))}
    </ScrollView>

    <Pressable
      onPress={() => setGalleryVisible(false)}
      style={styles.galleryClose}
      accessibilityRole="button"
      accessibilityLabel="إغلاق معرض الصور"
      hitSlop={10}
    >
      <Ionicons
        name="close"
        size={25}
        color={colors.white}
      />
    </Pressable>

    {galleryImages.length > 0 ? (
      <View style={styles.galleryCounter}>
        <AppText style={styles.galleryCounterText}>
          {`${activeImageIndex + 1} من ${galleryImages.length}`}
        </AppText>
      </View>
    ) : null}
  </View>
</Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  detailTopBar: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  detailTopIconButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  detailTopCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  detailEyebrow: { fontSize: 10 },
  detailTopActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  detailActionButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heroShell: { borderRadius: radii.xl, padding: spacing.xs, backgroundColor: 'rgba(255,255,255,0.62)', borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  hero: { width: '100%', height: 252, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  heroPressable: {
  width: '100%',
  borderRadius: radii.lg,
  overflow: 'hidden',
},
expandButton: {
  position: 'absolute',
  top: spacing.sm,
  left: spacing.sm,
  width: 38,
  height: 38,
  borderRadius: 19,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0,0,0,0.55)',
},
galleryModal: {
  flex: 1,
  backgroundColor: '#000000',
},
galleryPage: {
  height: '100%',
  justifyContent: 'center',
  alignItems: 'center',
},
galleryImage: {
  width: '100%',
  height: '100%',
},
galleryClose: {
  position: 'absolute',
  top: 52,
  right: 20,
  width: 42,
  height: 42,
  borderRadius: 21,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(30,30,30,0.72)',
},
galleryCounter: {
  position: 'absolute',
  bottom: 38,
  alignSelf: 'center',
  borderRadius: radii.round,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  backgroundColor: 'rgba(30,30,30,0.72)',
},
galleryCounterText: {
  color: colors.white,
  fontSize: 13,
},
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
  captureNode: { position: 'absolute', left: -10000, top: 0, width: 1080, height: 1080 },
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
  gap8: { gap: spacing.xs },
  noticeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  noticeText: { flex: 1 },
  title: { fontSize: 28, lineHeight: 35, textAlign: 'right' },
  titleBlock: { gap: 5, alignItems: 'flex-end' },
  descriptionText: { lineHeight: 22, textAlign: 'right' },
  infoBlock: { gap: spacing.md },
  metaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  likePill: {
    maxWidth: "100%",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(221,208,197,0.78)",
    borderRadius: radii.round,
    backgroundColor: "rgba(255,253,248,0.72)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  metaPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  metaText: { fontSize: 12 },
  desireHighlight: { borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F7E8DD', padding: spacing.sm, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  desireIcon: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  desireCopy: { flex: 1, gap: 5, alignItems: 'flex-end' },
  desireText: { textAlign: 'right', lineHeight: 20 },
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
  storyStackCard: { gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  storyStackHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  storyStackIcon: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  storyStackCopy: { flex: 1, gap: 2, alignItems: 'flex-end' },
  storySegments: { gap: 0 },
  storySegment: { gap: 5, paddingVertical: spacing.xs },
  storySegmentDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  storySegmentHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  storySegmentLabel: { fontSize: 12 },
  tagsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  tagPill: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, borderRadius: radii.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  tagText: { fontSize: 12 },
  ctaPanel: { marginTop: spacing.sm, gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F6E4D8' },
  ownerCtaPanel: { borderColor: colors.border, backgroundColor: colors.surface },
  ctaHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  ctaIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  ctaCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  ctaTitle: { fontSize: 18 },
  ctaHint: { textAlign: 'right', lineHeight: 19 },
  stateBox: { gap: spacing.md },
  detailLoadingShell: { gap: spacing.md },
  detailSkeletonBlock: { backgroundColor: colors.primarySoft, opacity: 0.72 },
  detailLoadingCopy: { gap: spacing.sm },
  detailSkeletonTitle: { width: '72%', height: 22, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  detailSkeletonLine: { width: '100%', height: 14, borderRadius: radii.sm, backgroundColor: colors.primarySoft, opacity: 0.72 },
  detailSkeletonLineShort: { width: '58%' },
  shareErrorText: { color: colors.primary },
});
