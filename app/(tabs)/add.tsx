import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/lib/auth';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { fetchActiveCategories, ItemCondition, publishItem, type PublishProgress } from '@/lib/publish-item';
import { consumePendingInboundSharedMedia } from '@/lib/inbound-shared-media';
import { ADD_ITEM_DRAFT_VERSION, clearAddItemDraft, hasMeaningfulAddItemDraft, loadAddItemDraft, saveAddItemDraft, type AddItemDraft } from '@/lib/add-item-draft';
import { clearAddItemDraftMedia, deleteAddItemDraftMediaAsset, persistAddItemDraftMediaAssets, restoreAddItemDraftMediaAssets, toAddItemDraftMediaAssets } from '@/lib/add-item-draft-media';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { resolveCurrentAddItemLocation } from '@/lib/discovery-location';
import { ItemPhotoStudio } from '@/components/item/ItemPhotoStudio';
import { ItemPhotoComposerSheet } from '@/components/item/ItemPhotoComposerSheet';

const steps = ['الصور', 'تعريف الحاجة', 'الحالة', 'القصة', 'المقابل', 'المراجعة'];
const conditionOptions: { key: ItemCondition; label: string }[] = [
  { key: 'almost_new', label: 'شبه جديد' },
  { key: 'good_used', label: 'مستعمل بحالة جيدة' },
  { key: 'minor_issues', label: 'به ملاحظات بسيطة' },
  { key: 'needs_repair', label: 'يحتاج إصلاح' },
];
const desireOptions = [
  { key: 'specific', label: 'محدد' },
  { key: 'flexible', label: 'مرن' },
  { key: 'surprise', label: 'مفاجأة' },
] as const;
const MAX_ASSETS = 4;
const MAX_VIDEO_DURATION_MS = 15_000;

export default function AddScreen() {
  const { user } = useAuth();
  const { sharedIntent } = useLocalSearchParams<{ sharedIntent?: string }>();
  const [step, setStep] = useState(0);
  const [mediaState, setMediaState] = useState<{ assets: ImagePicker.ImagePickerAsset[]; feedback: string | null }>({ assets: [], feedback: null });
  const [videoTeaser, setVideoTeaser] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [categories, setCategories] = useState<{ id: string; name_ar: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [publishFailure, setPublishFailure] = useState<string | null>(null);
  const [itemPhotoStudioVisible, setItemPhotoStudioVisible] = useState(false);
  const [itemPhotoComposerVisible, setItemPhotoComposerVisible] = useState(false);
  const [itemPhotoComposerTargetIndex, setItemPhotoComposerTargetIndex] = useState<number | null>(null);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [locationLatitude, setLocationLatitude] = useState<number | null>(null);
  const [locationLongitude, setLocationLongitude] = useState<number | null>(null);
  const [condition, setCondition] = useState<ItemCondition>('good_used');
  const [conditionNotes, setConditionNotes] = useState('');
  const [description, setDescription] = useState('');
  const [itemStory, setItemStory] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [goodFor, setGoodFor] = useState('');
  const [desireMode, setDesireMode] = useState<'specific' | 'flexible' | 'surprise'>('flexible');
  const [desireText, setDesireText] = useState('');
  const [wantedTags, setWantedTags] = useState('');
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [locationFillLoading, setLocationFillLoading] = useState(false);
  const [locationFillMessage, setLocationFillMessage] = useState<string | null>(null);
  const [locationFillError, setLocationFillError] = useState<string | null>(null);
  const assets = mediaState.assets;
  const videoTeaserDurationLabel = useMemo(() => {
    if (videoTeaser?.duration == null) return null;
    const seconds = Math.max(0, Math.round(videoTeaser.duration / 1000));
    return `${seconds} ثانية`;
  }, [videoTeaser]);
  const { isDefinitelyOffline } = useOfflineStatus();
  const rejectedPersistedCleanupQueueRef = useRef<ImagePicker.ImagePickerAsset[]>([]);


  useEffect(() => {
    fetchActiveCategories()
      .then(setCategories)
      .catch((err) => {
        if (__DEV__) console.log('[add-item] categories load failed', { code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
        setCategories([]);
      });
  }, []);

  const resetDraftFields = () => {
    setTitle('');
    setCategoryId(null);
    setCity('');
    setArea('');
    setLocationLatitude(null);
    setLocationLongitude(null);
    setCondition('good_used');
    setConditionNotes('');
    setDescription('');
    setItemStory('');
    setSwapReason('');
    setGoodFor('');
    setDesireMode('flexible');
    setDesireText('');
    setWantedTags('');
  };

  const currentDraft: AddItemDraft = {
    version: ADD_ITEM_DRAFT_VERSION,
    updatedAt: new Date(0).toISOString(),
    step,
    title,
    categoryId,
    city,
    area,
    locationLatitude,
    locationLongitude,
    condition,
    conditionNotes,
    description,
    itemStory,
    swapReason,
    goodFor,
    desireMode,
    desireText,
    wantedTags,
    mediaAssets: toAddItemDraftMediaAssets(assets),
  };

  useEffect(() => {
    let active = true;

    const hydrateDraft = async () => {
      const draft = await loadAddItemDraft(user?.id);
      if (!active) return;
      if (draft && hasMeaningfulAddItemDraft(draft)) {
        setTitle(draft.title);
        setCategoryId(draft.categoryId);
        setCity(draft.city);
        setArea(draft.area);
        setLocationLatitude(draft.locationLatitude);
        setLocationLongitude(draft.locationLongitude);
        setCondition(draft.condition);
        setConditionNotes(draft.conditionNotes);
        setDescription(draft.description);
        setItemStory(draft.itemStory);
        setSwapReason(draft.swapReason);
        setGoodFor(draft.goodFor);
        setDesireMode(draft.desireMode);
        setDesireText(draft.desireText);
        setWantedTags(draft.wantedTags);

        const restoredAssets = await restoreAddItemDraftMediaAssets(draft.mediaAssets);
        setMediaState({ assets: restoredAssets, feedback: null });

        if (draft.mediaAssets.length > 0 && restoredAssets.length === draft.mediaAssets.length) {
          setStep(Math.max(0, Math.min(5, draft.step)));
          setDraftNotice('استعدنا مسودة الإعلان وصورها، يمكنك المتابعة من حيث توقفت.');
        } else if (draft.mediaAssets.length > 0 && restoredAssets.length > 0) {
          setStep(0);
          setDraftNotice('استعدنا المسودة وبعض الصور، راجع صور العنصر قبل المتابعة.');
        } else {
          setStep(0);
          setDraftNotice('استعدنا بيانات المسودة، أعد إضافة الصور لإكمال النشر.');
        }

        setHasSavedDraft(true);
      }
      setDraftHydrated(true);
    };

    void hydrateDraft();

    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!draftHydrated) return;

    const timer = setTimeout(() => {
      if (!hasMeaningfulAddItemDraft(currentDraft)) {
        void clearAddItemDraft(user?.id);
        void clearAddItemDraftMedia(user?.id);
        setHasSavedDraft(false);
        setDraftNotice(null);
        return;
      }
      void saveAddItemDraft(user?.id, currentDraft);
      setHasSavedDraft(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [currentDraft, draftHydrated, user?.id]);

  const mergeAssets = (current: ImagePicker.ImagePickerAsset[], incoming: ImagePicker.ImagePickerAsset[]) => {
    const seenUris = new Set(current.map((a) => a.uri));
    const uniqueIncoming = incoming.filter((a) => {
      if (!a.uri || seenUris.has(a.uri)) return false;
      seenUris.add(a.uri);
      return true;
    });
    const remaining = Math.max(MAX_ASSETS - current.length, 0);
    const toAdd = uniqueIncoming.slice(0, remaining);
    return {
      next: [...current, ...toAdd],
      wasTrimmed: uniqueIncoming.length > toAdd.length,
    };
  };

  const appendAssets = async (incoming: ImagePicker.ImagePickerAsset[], source: 'camera' | 'gallery' | 'pending' | 'shareIntent') => {
    if (!incoming.length) return;

    const incomingUniqueByUri = (() => {
      const seenUris = new Set<string>();
      return incoming.filter((asset) => {
        if (!asset.uri || seenUris.has(asset.uri)) return false;
        seenUris.add(asset.uri);
        return true;
      });
    })();

    if (!incomingUniqueByUri.length) return;

    const persisted = await persistAddItemDraftMediaAssets(user?.id, incomingUniqueByUri);
    if (!persisted.length) return;

    setMediaState((prev) => {
      const { next, wasTrimmed } = mergeAssets(prev.assets, persisted);
      const acceptedUris = new Set(next.slice(prev.assets.length).map((asset) => asset.uri));
      const rejectedPersisted = persisted.filter((asset) => !acceptedUris.has(asset.uri));
      if (rejectedPersisted.length) {
        rejectedPersistedCleanupQueueRef.current.push(...rejectedPersisted);
      }

      return {
        assets: next,
        feedback: wasTrimmed && source !== 'pending'
          ? `يمكنك إضافة ${MAX_ASSETS} صور كحد أقصى، تم إضافة المتاح فقط.`
          : null,
      };
    });
  };

  useEffect(() => {
    if (!rejectedPersistedCleanupQueueRef.current.length) return;

    const queued = [...rejectedPersistedCleanupQueueRef.current];
    rejectedPersistedCleanupQueueRef.current = [];
    void Promise.allSettled(queued.map((asset) => deleteAddItemDraftMediaAsset(asset)));
  }, [mediaState.assets]);


  useEffect(() => {
    const inboundAssets = consumePendingInboundSharedMedia();
    if (!inboundAssets.length) return;

    setStep((prev) => (prev === 0 ? prev : 0));
    setError(null);
    void appendAssets(inboundAssets, 'shareIntent');
  }, [sharedIntent]);

  useEffect(() => {
    let mounted = true;

    const recoverPendingPicker = async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        if (!mounted || !pending || !('canceled' in pending) || pending.canceled || 'code' in pending) return;
        void appendAssets(pending.assets ?? [], 'pending');
      } catch (err) {
        if (__DEV__) console.log('[add-item] pending picker recovery failed', { code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      }
    };

    recoverPendingPicker();

    return () => {
      mounted = false;
    };
  }, []);

  const openItemPhotoComposer = (index: number) => {
    const target = assets[index];
    if (!target) return;
    setError(null);
    setItemPhotoComposerTargetIndex(index);
    setItemPhotoComposerVisible(true);
  };

  const openItemPhotoStudio = () => {
    if (assets.length >= MAX_ASSETS) {
      setError('وصلت للحد الأقصى من الصور (4). احذف صورة لإضافة غيرها.');
      return;
    }

    setError(null);
    setItemPhotoStudioVisible(true);
  };
  const pickFromGallery = async () => {
    const remaining = Math.max(MAX_ASSETS - assets.length, 0);
    if (!remaining) {
      setError('وصلت للحد الأقصى من الصور (4). احذف صورة لإضافة غيرها.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.9 });
    if (result.canceled) return;
    setError(null);
    void appendAssets(result.assets ?? [], 'gallery');
  };


  const pickVideoTeaser = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1 });
    if (result.canceled) return;

    const selected = result.assets?.[0];
    if (!selected?.uri) return;

    if (selected.type !== 'video' && !selected.mimeType?.startsWith('video/')) {
      setError('اختر ملف فيديو فقط للمحة الحاجة.');
      return;
    }

    if (selected.duration != null && selected.duration > MAX_VIDEO_DURATION_MS) {
      setError('فيديو اللمحة يجب ألا يتجاوز 15 ثانية. اختر فيديو أقصر.');
      return;
    }

    setVideoTeaser(selected);
    setError(null);
  };

  const removeVideoTeaser = () => {
    setVideoTeaser(null);
    setError(null);
  };

  const removeAssetAt = (index: number) => {
    const removedAsset = assets[index];
    if (removedAsset?.uri) void deleteAddItemDraftMediaAsset(removedAsset);
    setMediaState((prev) => ({ ...prev, assets: prev.assets.filter((_, i) => i !== index), feedback: null }));
  };

  const handleDragBegin = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const handleDragEnd = ({ data }: { data: ImagePicker.ImagePickerAsset[] }) => {
    const changed = assets.length === data.length
      && assets.some((asset, index) => asset.uri !== data[index]?.uri);

    if (!changed) return;

    setMediaState((prev) => ({ ...prev, assets: [...data], feedback: null }));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const handleFillLocationFromDevice = async () => {
    setLocationFillLoading(true);
    setLocationFillMessage(null);
    setLocationFillError(null);
    try {
      const result = await resolveCurrentAddItemLocation();
      if (result.ok) {
        setCity(result.city);
        setArea(result.area ?? '');
        setLocationLatitude(result.latitude);
        setLocationLongitude(result.longitude);
        setLocationFillMessage(`اقترحنا موقعك: ${result.label}. يمكنك تعديله قبل النشر.`);
        return;
      }
      setLocationFillError(result.message);
    } finally {
      setLocationFillLoading(false);
    }
  };

  const validateCurrentStep = () => {
    if (step === 0) {
      if (!assets.length) return 'اختر صورة واحدة على الأقل.';
      if (assets.length > 4) return 'الحد الأقصى 4 صور.';
      for (const a of assets) {
        if (a.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType)) return 'نوع الصورة غير مدعوم.';
      }
      if (videoTeaser) {
        if (videoTeaser.type !== 'video' && !videoTeaser.mimeType?.startsWith('video/')) return 'فيديو اللمحة يجب أن يكون ملف فيديو.';
        if (videoTeaser.duration != null && videoTeaser.duration > MAX_VIDEO_DURATION_MS) return 'فيديو اللمحة يجب ألا يتجاوز 15 ثانية.';
      }
    }
    if (step === 1) {
      if (!title.trim()) return 'العنوان مطلوب.';
      if (categories.length && !categoryId) return 'اختر فئة مناسبة.';
    }
    if (step === 3) {
      if (itemStory.length > 600 || swapReason.length > 240 || goodFor.length > 240) return 'تأكد من حدود الأحرف في هذه الخطوة.';
    }
    return null;
  };

  const next = () => {
    const e = validateCurrentStep();
    setError(e);
    if (!e) setStep((s) => Math.min(s + 1, 5));
  };
  const back = () => {
    setError(null);
    if (step === 5) setPublishFailure(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = async () => {
    if (!user) {
      setError('يجب تسجيل الدخول قبل النشر.');
      return;
    }
    const e = validateCurrentStep();
    if (e) {
      setError(e);
      return;
    }
    setError(null);
    setPublishFailure(null);

    if (isDefinitelyOffline) {
      const offlineMessage = 'لا يوجد اتصال بالإنترنت. بيانات الإعلان محفوظة، حاول النشر بعد عودة الاتصال.';
      setError(offlineMessage);
      setPublishFailure(offlineMessage);
      return;
    }

    setSubmitting(true);
    setProgress('جارٍ تحسين الصور...');
    try {
      const totalAssets = assets.length;
      const result = await publishItem(
        {
          title: title.trim(),
          categoryId,
          city: city.trim() || null,
          area: area.trim() || null,
          locationLatitude,
          locationLongitude,
          condition,
          conditionNotes: conditionNotes.trim() || null,
          description: description.trim() || null,
          itemStory: itemStory.trim() || null,
          swapReason: swapReason.trim() || null,
          goodFor: goodFor.trim() || null,
          desireMode,
          desireText: desireText.trim() || null,
          wantedTags: wantedTags.split(',').map((x) => x.trim()).filter(Boolean),
        },
        assets,
        user.id,
        (progressState: PublishProgress) => {
          const total = progressState.total || totalAssets;
          if (progressState.phase === 'optimizing') {
            setProgress(`جارٍ تحسين الصورة ${progressState.current} من ${total}...`);
            return;
          }
          if (progressState.phase === 'video_uploading') {
            setProgress('جارٍ رفع فيديو اللمحة...');
            return;
          }
          setProgress(`جارٍ رفع الصورة ${progressState.current} من ${total}...`);
        },
        videoTeaser,
      );
      if (!result.ok) {
        setError(result.message);
        setPublishFailure(result.message);
        return;
      }
      setPublishFailure(null);
      await clearAddItemDraft(user.id);
      await clearAddItemDraftMedia(user.id);
      setVideoTeaser(null);
      setHasSavedDraft(false);
      setDraftNotice(null);
      setProgress('تم نشر العنصر بنجاح.');
      router.push(`/item/${result.itemId}`);
    } catch (err) {
      if (__DEV__) console.log('[add-item] submit failed', { userId: user.id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      const fallbackMessage = 'تعذر نشر العنصر حالياً. حاول مرة أخرى.';
      setError(fallbackMessage);
      setPublishFailure(fallbackMessage);
    } finally {
      setSubmitting(false);
      setProgress('');
    }
  };

  const reviewImages = useMemo(() => assets, [assets]);
  const showDraftCard = draftNotice || hasSavedDraft;

  const discardDraftAndReset = async () => {
    await clearAddItemDraft(user?.id);
    await clearAddItemDraftMedia(user?.id);
    resetDraftFields();
    setMediaState({ assets: [], feedback: null });
    setVideoTeaser(null);
    setLocationFillLoading(false);
    setLocationFillMessage(null);
    setLocationFillError(null);
    setStep(0);
    setError(null);
    setDraftNotice(null);
    setHasSavedDraft(false);
  };

  return <AppScreen scrollable backgroundVariant='alive'><LinearGradient colors={['#FFF6EC', '#FFE7CF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerCard}>
    <View style={styles.heroOrb} />
    <View style={styles.heroIconShell}><Ionicons name='create-outline' size={22} color={colors.primary} /></View>
    <View style={styles.header}>
      <AppText weight='bold' style={styles.title}>جهّز عنصرًا جديدًا</AppText>
      <AppText muted>صور واضحة، حكاية مختصرة، ومقابل مناسب… والباقي يبدأ من هنا.</AppText>
      <View style={styles.stepPill}><AppText weight='semibold'>الخطوة {step + 1} من 6 — {steps[step]}</AppText></View>
    </View>
    <View style={styles.progressTrack}>{steps.map((_, i) => <View key={`step-dot-${i}`} style={[styles.progressDot, i < step && styles.progressDotCompleted, i === step && styles.progressDotCurrent]} />)}</View>
  </LinearGradient>
    {showDraftCard && <AppCard style={styles.noticeCard}><View style={styles.gap}><View style={styles.noticeRow}><Ionicons name='bookmark-outline' size={18} color={colors.primary} /><AppText muted>{draftNotice ?? 'لديك مسودة محفوظة لهذا الإعلان.'}</AppText></View><View style={styles.actions}><AppButton label='ابدأ من جديد' variant='neutral' onPress={() => { void discardDraftAndReset(); }} disabled={submitting} /></View></View></AppCard>}
    {isDefinitelyOffline && <AppCard style={styles.noticeCard}><View style={styles.gap}><View style={styles.noticeRow}><Ionicons name='cloud-offline-outline' size={18} color={colors.primary} /><AppText weight='bold'>أنت غير متصل بالإنترنت</AppText></View><AppText muted>يمكنك تجهيز الإعلان الآن، لكن النشر سيحتاج اتصالًا بالإنترنت. بيانات المسودة محفوظة.</AppText></View></AppCard>}
    {error && <AppCard style={styles.noticeCard}><View style={styles.noticeRow}><Ionicons name='alert-circle-outline' size={18} color={colors.primary} /><AppText style={styles.error}>{error}</AppText></View></AppCard>}
    {step === 0 && !!mediaState.feedback && <AppCard style={styles.studioCard}><AppText style={styles.error}>{mediaState.feedback}</AppText></AppCard>}
    {step === 0 && <AppCard style={styles.studioCard}><View style={styles.gap}><View style={styles.sectionHeaderRow}><View style={styles.sectionHeaderIcon}><Ionicons name='images-outline' size={16} color={colors.primary} /></View><View style={styles.sectionHeader}><AppText weight='bold'>صور العنصر</AppText><AppText muted>{assets.length} من 4 صور</AppText></View></View>{!assets.length ? <View style={styles.emptyMedia}><AppText weight='bold'>ابدأ بصورة واضحة لعنصرك</AppText><AppText muted>أضف حتى 4 صور، والصورة الأولى ستظهر كغلاف.</AppText><View style={styles.actions}><AppButton label='التقط صورة' onPress={openItemPhotoStudio} disabled={submitting} /><AppButton label='اختر من المعرض' variant='neutral' onPress={pickFromGallery} disabled={submitting} /></View></View> : <View style={styles.gap}><View style={styles.coverCard}><Image source={{ uri: assets[0]?.uri }} style={styles.coverPreview} /><View style={styles.coverBadge}><AppText style={styles.coverBadgeText}>الغلاف</AppText></View><View style={styles.mediaActionRow}><Pressable onPress={() => openItemPhotoComposer(0)} disabled={submitting} style={styles.mediaPill}><AppText muted>تهيئة</AppText></Pressable><Pressable onPress={() => removeAssetAt(0)} disabled={submitting} style={styles.mediaPill}><AppText muted>حذف</AppText></Pressable></View></View><AppText muted>اضغط مطولًا واسحب لإعادة ترتيب الصور.</AppText><DraggableFlatList data={assets} keyExtractor={(item) => item.uri} horizontal containerStyle={styles.draggableList} contentContainerStyle={styles.draggableContent} onDragBegin={handleDragBegin} onDragEnd={handleDragEnd} renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<ImagePicker.ImagePickerAsset>) => { const index = getIndex() ?? 0; return <Pressable onLongPress={drag} disabled={submitting} style={[styles.thumbCard, index === 0 && styles.coverThumbCard, isActive && styles.thumbCardActive]}><Image source={{ uri: item.uri }} style={styles.thumbImage} /><View style={styles.thumbMetaRow}><AppText muted>#{index + 1}</AppText>{index === 0 && <View style={styles.thumbCoverBadge}><AppText style={styles.coverBadgeText}>الغلاف</AppText></View>}</View><View style={styles.mediaActionRow}><Pressable onPress={() => openItemPhotoComposer(index)} disabled={submitting} style={[styles.mediaPill, submitting && styles.pillDisabled]}><AppText muted>تهيئة</AppText></Pressable><Pressable onPress={() => removeAssetAt(index)} disabled={submitting} style={[styles.mediaPill, submitting && styles.pillDisabled]}><AppText muted>حذف</AppText></Pressable></View></Pressable>; }} /><View style={styles.actions}><AppButton label='التقط صورة' onPress={openItemPhotoStudio} disabled={submitting || assets.length >= 4} /><AppButton label='اختر من المعرض' variant='neutral' onPress={pickFromGallery} disabled={submitting || assets.length >= 4} /></View></View>}<AppText muted>اختر من 1 إلى 4 صور.</AppText></View></AppCard>}
    {step === 0 && <AppCard style={styles.studioCard}><View style={styles.gap}><View style={styles.sectionHeaderRow}><View style={styles.sectionHeaderIcon}><Ionicons name='videocam-outline' size={16} color={colors.primary} /></View><View style={styles.sectionHeader}><AppText weight='bold'>فيديو قصير للحاجة</AppText><AppText muted>اختياري — لمحة سريعة تساعد الناس يشوفوا العنصر بشكل أصدق.</AppText></View></View>{videoTeaser ? <View style={styles.videoTeaserCard}><View style={styles.videoIcon}><Ionicons name='play' size={20} color={colors.surface} /></View><View style={styles.videoTeaserMeta}><AppText weight='semibold'>تم اختيار فيديو اللمحة</AppText><AppText muted>{videoTeaserDurationLabel ? `المدة: ${videoTeaserDurationLabel}` : 'الفيديو جاهز، ولم تصلنا مدة الملف.'}</AppText>{videoTeaser.fileName ? <AppText muted numberOfLines={1}>{videoTeaser.fileName}</AppText> : null}</View><View style={styles.videoActions}><Pressable onPress={pickVideoTeaser} disabled={submitting} style={[styles.mediaPill, submitting && styles.pillDisabled]}><AppText muted>تغيير</AppText></Pressable><Pressable onPress={removeVideoTeaser} disabled={submitting} style={[styles.mediaPill, submitting && styles.pillDisabled]}><AppText muted>حذف</AppText></Pressable></View></View> : <View style={styles.emptyMedia}><AppText weight='bold'>أضف لمحة فيديو اختيارية</AppText><AppText muted>فيديو واحد حتى 15 ثانية. الصور تظل مطلوبة كمعرض أساسي.</AppText><View style={styles.actions}><AppButton label='اختر فيديو' variant='neutral' onPress={pickVideoTeaser} disabled={submitting} /></View></View>}<AppText muted>لا نحفظ فيديو اللمحة ضمن المسودات حالياً؛ أضفه عند النشر النهائي.</AppText></View></AppCard>}
    {step === 1 && <AppCard style={styles.studioCard}><View style={styles.gap}><View style={styles.sectionHeaderRow}><View style={styles.sectionHeaderIcon}><Ionicons name='cube-outline' size={16} color={colors.primary} /></View><View style={styles.sectionHeader}><AppText weight='bold'>تعريف الحاجة</AppText><AppText muted>أضف الأساسيات التي تساعد على الفهم السريع.</AppText></View></View><AppInput value={title} onChangeText={setTitle} placeholder='عنوان العنصر *' />
      <View style={styles.rowWrap}>{categories.map((c) => <Pressable key={c.id} onPress={() => setCategoryId(c.id)} style={[styles.chip, categoryId === c.id && styles.chipSelected]}><AppText>{c.name_ar}</AppText></Pressable>)}</View>
      <AppInput value={city} onChangeText={(value) => { setCity(value); if (locationLatitude !== null || locationLongitude !== null) { setLocationLatitude(null); setLocationLongitude(null); } }} placeholder='المدينة (اختياري)' /><AppInput value={area} onChangeText={(value) => { setArea(value); if (locationLatitude !== null || locationLongitude !== null) { setLocationLatitude(null); setLocationLongitude(null); } }} placeholder='المنطقة (اختياري)' />
      <View style={styles.locationAssistBlock}>
        <View style={styles.locationAssistHeader}><Ionicons name='navigate-outline' size={16} color={colors.primary} /><AppText weight='semibold'>مساعد تحديد الموقع</AppText></View>
        <AppButton
          label={locationFillLoading ? 'جارٍ تحديد موقعك...' : 'املأ المدينة من موقعي'}
          variant='neutral'
          onPress={() => { void handleFillLocationFromDevice(); }}
          disabled={locationFillLoading || submitting}
        />
        <AppText muted>نستخدم موقعك مرة واحدة. المطابقة الدقيقة للقريب تعمل فقط عند التعبئة من موقع الجهاز.</AppText>
        {locationFillMessage && <AppText muted>{locationFillMessage}</AppText>}
        {locationFillError && <AppText style={styles.error}>{locationFillError}</AppText>}
      </View></View></AppCard>}
    {step === 2 && <AppCard style={styles.studioCard}><View style={styles.gap}><View style={styles.sectionHeaderRow}><View style={styles.sectionHeaderIcon}><Ionicons name='shield-checkmark-outline' size={16} color={colors.primary} /></View><View style={styles.sectionHeader}><AppText weight='bold'>حالة العنصر</AppText><AppText muted>اختر الحالة بدقة لرفع الثقة.</AppText></View></View><View style={styles.rowWrap}>{conditionOptions.map((c) => <Pressable key={c.key} onPress={() => setCondition(c.key)} style={[styles.chip, condition === c.key && styles.chipSelected]}><AppText>{c.label}</AppText></Pressable>)}</View><AppInput value={conditionNotes} onChangeText={setConditionNotes} placeholder='ملاحظات الحالة' /><AppInput value={description} onChangeText={setDescription} placeholder='الوصف' multiline /></View></AppCard>}
    {step === 3 && <AppCard style={styles.studioCard}><View style={styles.gap}><View style={styles.sectionHeaderRow}><View style={styles.sectionHeaderIcon}><Ionicons name='book-outline' size={16} color={colors.primary} /></View><View style={styles.sectionHeader}><AppText weight='bold'>قصة العنصر</AppText><AppText muted>تفاصيل مختصرة تساعد الطرف الآخر على القرار.</AppText></View></View><AppInput value={itemStory} onChangeText={setItemStory} placeholder='قصة العنصر (حد 600)' multiline /><View style={styles.counterPill}><AppText muted>{itemStory.length}/600</AppText></View><AppInput value={swapReason} onChangeText={setSwapReason} placeholder='سبب المبادلة (حد 240)' /><View style={styles.counterPill}><AppText muted>{swapReason.length}/240</AppText></View><AppInput value={goodFor} onChangeText={setGoodFor} placeholder='مفيد لمن؟ (حد 240)' /><View style={styles.counterPill}><AppText muted>{goodFor.length}/240</AppText></View></View></AppCard>}
    {step === 4 && <AppCard style={styles.studioCard}><View style={styles.gap}><View style={styles.sectionHeaderRow}><View style={styles.sectionHeaderIcon}><Ionicons name='swap-horizontal-outline' size={16} color={colors.primary} /></View><View style={styles.sectionHeader}><AppText weight='bold'>المقابل المطلوب</AppText><AppText muted>حدّد تفضيلك بشكل واضح وبسيط.</AppText></View></View><View style={styles.rowWrap}>{desireOptions.map((d) => <Pressable key={d.key} onPress={() => setDesireMode(d.key)} style={[styles.chip, desireMode === d.key && styles.chipSelected]}><AppText>{d.label}</AppText></Pressable>)}</View><AppInput value={desireText} onChangeText={setDesireText} placeholder='ماذا تريد بالمقابل؟' /><AppInput value={wantedTags} onChangeText={setWantedTags} placeholder='وسوم مطلوبة مفصولة بفواصل' /></View></AppCard>}
    {step === 5 && publishFailure && <AppCard style={styles.noticeCard}><View style={styles.gap}><View style={styles.noticeRow}><Ionicons name='alert-circle-outline' size={18} color={colors.primary} /><AppText weight='bold'>لم يكتمل النشر</AppText></View><AppText>{publishFailure}</AppText><AppText muted>بيانات الإعلان محفوظة، يمكنك المحاولة مرة أخرى.</AppText><AppButton label='حاول النشر مرة أخرى' onPress={submit} disabled={submitting} /></View></AppCard>}
    {step === 5 && <AppCard style={styles.studioCard}><View style={styles.gap}><View style={styles.sectionHeaderRow}><View style={styles.sectionHeaderIcon}><Ionicons name='checkmark-circle-outline' size={16} color={colors.primary} /></View><View style={styles.sectionHeader}><AppText weight='bold'>مراجعة قبل النشر</AppText><AppText muted>تأكد من التفاصيل والصور قبل الإرسال.</AppText></View></View><View style={styles.reviewCover}><Image source={{ uri: reviewImages[0]?.uri }} style={styles.reviewCoverImage} />{reviewImages[0] && <View style={styles.coverBadge}><AppText style={styles.coverBadgeText}>صورة الغلاف</AppText></View>}</View>{reviewImages.length > 1 && <View style={styles.row}>{reviewImages.slice(1).map((a) => <Image key={a.uri} source={{ uri: a.uri }} style={styles.preview} />)}</View>}<View style={styles.summaryBox}><View style={styles.reviewRow}><AppText muted>العنوان</AppText><AppText>{title || '-'}</AppText></View><View style={styles.reviewRow}><AppText muted>المدينة/المنطقة</AppText><AppText>{city || '-'} / {area || '-'}</AppText></View><View style={styles.reviewRow}><AppText muted>الحالة</AppText><AppText>{conditionOptions.find((c) => c.key === condition)?.label || '-'}</AppText></View><View style={styles.reviewRow}><AppText muted>المقابل</AppText><AppText>{desireOptions.find((d) => d.key === desireMode)?.label || '-'} {desireText ? `- ${desireText}` : ''}</AppText></View><View style={styles.reviewRow}><AppText muted>الوسوم</AppText><AppText>{wantedTags || '-'}</AppText></View><View style={styles.reviewRow}><AppText muted>فيديو اللمحة</AppText><AppText>{videoTeaser ? 'مضاف' : 'غير مضاف'}</AppText></View></View>{!!progress && <View style={styles.progressPill}><Ionicons name='cloud-upload-outline' size={14} color={colors.primary} /><AppText muted>{progress}</AppText></View>}</View></AppCard>}
    <View style={styles.footerPanel}><View style={styles.actions}><AppButton label='السابق' variant='neutral' onPress={back} disabled={step === 0 || submitting} />{step < 5 ? <AppButton label='التالي' onPress={next} disabled={submitting} /> : <AppButton label='انشر العنصر' onPress={submit} disabled={submitting} />}</View></View>
    <ItemPhotoStudio
      visible={itemPhotoStudioVisible}
      remainingSlots={Math.max(MAX_ASSETS - assets.length, 0)}
      onClose={() => setItemPhotoStudioVisible(false)}
      onUseCapturedPhotos={(capturedAssets) => {
        setError(null);
        setItemPhotoStudioVisible(false);
        void appendAssets(capturedAssets, 'camera');
      }}
    />
    <ItemPhotoComposerSheet
      visible={itemPhotoComposerVisible}
      originalAsset={
        itemPhotoComposerTargetIndex !== null
          ? assets[itemPhotoComposerTargetIndex] ?? null
          : null
      }
      assetIndex={itemPhotoComposerTargetIndex}
      onClose={() => {
        setItemPhotoComposerVisible(false);
        setItemPhotoComposerTargetIndex(null);
      }}
      onUseComposedPhoto={async ({ asset: composedAsset, assetIndex }) => {
        const persisted = await persistAddItemDraftMediaAssets(user?.id, [composedAsset]);
        const persistedComposed = persisted[0];

        if (!persistedComposed) {
          setError('تعذر حفظ الصورة المعدلة ضمن المسودة. حاول مرة أخرى.');
          return;
        }

        const previousAsset = assets[assetIndex];
        if (previousAsset?.uri) {
          void deleteAddItemDraftMediaAsset(previousAsset);
        }

        setMediaState((prev) => ({
          ...prev,
          assets: prev.assets.map((asset, index) =>
            index === assetIndex ? persistedComposed : asset
          ),
          feedback: null,
        }));

        setError(null);
        setItemPhotoComposerVisible(false);
        setItemPhotoComposerTargetIndex(null);
      }}
    />
  </AppScreen>;
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  headerCard: { borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: spacing.md, gap: spacing.sm, overflow: 'hidden', position: 'relative' },
  heroOrb: { position: 'absolute', width: 180, height: 180, borderRadius: 99, right: -30, top: -60, backgroundColor: '#ffffff55' },
  heroIconShell: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  stepPill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#ffffffe8' },
  title: { fontSize: 24 },
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.border },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  actions: { flexDirection: 'row', gap: spacing.sm },
  footerPanel: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: spacing.sm, backgroundColor: colors.surface },
  studioCard: { borderRadius: 14 },
  noticeCard: { borderRadius: 14 },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  error: { color: colors.primary },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mediaMeta: { flex: 1, gap: spacing.xs },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressDot: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border },
  progressDotCompleted: { backgroundColor: colors.primary },
  progressDotCurrent: { backgroundColor: colors.accent },
  sectionHeader: { gap: 2 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionHeaderIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  emptyMedia: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 14, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.primarySoft },
  coverCard: { position: 'relative', gap: spacing.xs },
  coverPreview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.border },
  coverBadge: { position: 'absolute', top: spacing.xs, left: spacing.xs, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  coverBadgeText: { color: colors.surface, fontSize: 12 },
  draggableList: { marginTop: spacing.xs },
  draggableContent: { gap: spacing.xs },
  thumbCard: { width: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.xs, gap: spacing.xs, backgroundColor: colors.surface },
  coverThumbCard: { borderColor: colors.primary },
  thumbCardActive: { opacity: 0.75 },
  thumbImage: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: colors.border },
  thumbMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thumbCoverBadge: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  mediaActionRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  mediaPill: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.background },
  pillDisabled: { opacity: 0.45 },
  reviewCover: { position: 'relative' },
  reviewCoverImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.border },
  summaryBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.background },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 2 },
  progressPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  locationAssistBlock: { gap: spacing.xs },
  locationAssistHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  videoTeaserCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: spacing.sm, backgroundColor: colors.primarySoft },
  videoIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  videoTeaserMeta: { flex: 1, gap: 2 },
  videoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  counterPill: { alignSelf: 'flex-end', borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.primarySoft },
});
