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
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchActiveCategories, ItemCondition, publishItem, type PublishProgress } from '@/lib/publish-item';
import { consumePendingInboundSharedMedia } from '@/lib/inbound-shared-media';
import { ADD_ITEM_DRAFT_VERSION, clearAddItemDraft, hasMeaningfulAddItemDraft, loadAddItemDraft, saveAddItemDraft, type AddItemDraft } from '@/lib/add-item-draft';
import { clearAddItemDraftMedia, deleteAddItemDraftMediaAsset, persistAddItemDraftMediaAssets, restoreAddItemDraftMediaAssets, toAddItemDraftMediaAssets } from '@/lib/add-item-draft-media';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { resolveCurrentAddItemLocation } from '@/lib/discovery-location';
import { ItemPhotoStudio } from '@/components/item/ItemPhotoStudio';
import { ItemPhotoComposerSheet } from '@/components/item/ItemPhotoComposerSheet';
import { trackEvent } from '@/lib/analytics';
import { isSupportedImageAsset, prepareImageForUpload, validateVideoTeaserAsset } from '@/lib/media/upload-quality';
import { fetchDolabPublishSource, markDolabItemPublished } from '@/lib/dolab';
import { importDolabImagesToAssets, mapDolabItemToAddItemFields } from '@/lib/dolab/add-item-handoff';

const steps = ['الصور', 'التفاصيل', 'الحالة', 'القصة', 'المقابل', 'المراجعة'];
const stepIcons = ['images-outline', 'cube-outline', 'shield-checkmark-outline', 'book-outline', 'swap-horizontal-outline', 'checkmark-circle-outline'] as const;
const stepDescriptions = [
  'ورّي الحاجة بوضوح قبل أي كلام.',
  'قول هي إيه وفين موجودة.',
  'خلي حالتها واضحة من البداية.',
  'ضيف التفاصيل اللي تساعد على القرار.',
  'حدد إيه اللي يناسبك في التبديل.',
  'راجع الإعلان زي ما هيظهر للناس.',
];
const nextLabels = ['كمّل التفاصيل', 'حدّد الحالة', 'احكي قصتها', 'حدّد المقابل', 'راجع الإعلان'];

const conditionOptions: { key: ItemCondition; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'almost_new', label: 'شبه جديد', description: 'استخدام خفيف جدًا ومظهر قريب من الجديد.', icon: 'sparkles-outline' },
  { key: 'good_used', label: 'مستعمل بحالة جيدة', description: 'مستخدم بشكل طبيعي وما زال جاهزًا للاستعمال.', icon: 'checkmark-circle-outline' },
  { key: 'minor_issues', label: 'به ملاحظات بسيطة', description: 'فيه عيوب أو آثار استخدام لازم تتقال بوضوح.', icon: 'information-circle-outline' },
  { key: 'needs_repair', label: 'يحتاج إصلاح', description: 'يحتاج شغل أو إصلاح قبل الاستخدام الطبيعي.', icon: 'construct-outline' },
];
const desireOptions = [
  { key: 'specific', label: 'محدد', description: 'عارف تقريبًا إيه اللي عايزه بالمقابل.', icon: 'locate-outline' },
  { key: 'flexible', label: 'مرن', description: 'مفتوح لاقتراحات مناسبة وقريبة من اهتمامك.', icon: 'git-compare-outline' },
  { key: 'surprise', label: 'مفاجأة', description: 'خلّي الناس تعرض أفكارها وشوف إيه يعجبك.', icon: 'gift-outline' },
] as const;
const MAX_ASSETS = 4;

export default function AddScreen() {
  const { user } = useAuth();
  const { sharedIntent, dolabItemId, source } = useLocalSearchParams<{ sharedIntent?: string; dolabItemId?: string; source?: string }>();
  const [step, setStep] = useState(0);
  const [mediaState, setMediaState] = useState<{ assets: ImagePicker.ImagePickerAsset[]; feedback: string | null }>({ assets: [], feedback: null });
  const [videoTeaser, setVideoTeaser] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [videoTeaserSizeLabel, setVideoTeaserSizeLabel] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name_ar: string }[]>([]);
  const [categoriesSettled, setCategoriesSettled] = useState(false);
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
  const [draftRecoveryDismissed, setDraftRecoveryDismissed] = useState(false);
  const [locationFillLoading, setLocationFillLoading] = useState(false);
  const [locationFillMessage, setLocationFillMessage] = useState<string | null>(null);
  const [locationFillError, setLocationFillError] = useState<string | null>(null);
  const [dolabNotice, setDolabNotice] = useState<string | null>(null);
  const [dolabImportChoicePending, setDolabImportChoicePending] = useState(false);
  const [pendingDolabApply, setPendingDolabApply] = useState<null | (() => Promise<void>)>(null);
  const dolabImportGuardRef = useRef<string | null>(null);
  const assets = mediaState.assets;
  const videoTeaserDurationLabel = useMemo(() => {
    if (videoTeaser?.duration == null) return null;
    const seconds = Math.max(0, Math.round(videoTeaser.duration / 1000));
    return `${seconds} ثانية`;
  }, [videoTeaser]);
  const formatVideoSizeLabel = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };
  const { isDefinitelyOffline } = useOfflineStatus();
  const rejectedPersistedCleanupQueueRef = useRef<ImagePicker.ImagePickerAsset[]>([]);

  useEffect(() => {
    setCategoriesSettled(false);
    fetchActiveCategories()
      .then((nextCategories) => {
        setCategories(nextCategories);
        setCategoriesSettled(true);
      })
      .catch((err) => {
        if (__DEV__) console.log('[add-item] categories load failed', { code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
        setCategories([]);
        setCategoriesSettled(true);
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
        setDraftRecoveryDismissed(false);
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

  useEffect(() => {
    if (!draftHydrated || !categoriesSettled || source !== 'dolab' || !dolabItemId || !user?.id) return;
    if (dolabImportGuardRef.current === dolabItemId) return;

    const runImport = async () => {
      const publishSource = await fetchDolabPublishSource(user.id, dolabItemId);
      if (!publishSource.data.item) {
        setDolabNotice('تعذر العثور على عنصر الدولاب المطلوب.');
        return;
      }

      const hasSourceError = Boolean(publishSource.error);
      if (hasSourceError) {
        setDolabNotice('تعذر تجهيز بيانات الدولاب بالكامل. حاول تحديث الدولاب أو افتح العنصر مرة تانية.');
      }

      const applyImport = async () => {
        const mapped = mapDolabItemToAddItemFields(publishSource.data.item!, categories);
        setTitle(mapped.title);
        setDescription(mapped.description);
        setCondition(mapped.condition);
        setConditionNotes(mapped.conditionNotes);
        setCategoryId(mapped.categoryId);
        setDesireText(mapped.desireText);

        if (!hasSourceError) {
          const imported = await importDolabImagesToAssets(publishSource.data.media);
          await appendAssets(imported.assets, 'dolab');
          const warnings = [...imported.warnings];
          if (!mapped.categoryMatched) warnings.push('اختار الفئة المناسبة قبل النشر.');
          if (publishSource.data.media.some((m) => m.media_type === 'video' || m.media_type === 'audio')) {
            warnings.push('فيديوهات الدولاب محفوظة، لكن لمحة العنصر هتتضاف يدويًا في الخطوة دي.');
          }
          setDolabNotice(['استوردنا بيانات من دولابك. راجع التفاصيل قبل النشر.', ...warnings].join(' '));
        }
        setDolabImportChoicePending(false);
      };

      dolabImportGuardRef.current = dolabItemId;
      if (hasMeaningfulAddItemDraft(currentDraft)) {
        setDolabImportChoicePending(true);
        setPendingDolabApply(() => applyImport);
      } else {
        await applyImport();
      }
    };

    void runImport();
  }, [draftHydrated, categoriesSettled, source, dolabItemId, user?.id, categories, currentDraft]);

  useEffect(() => {
    if (!user?.id) return;
    void trackEvent('item_create_started', { route: '/(tabs)/add' });
  }, [user?.id]);

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

  const appendAssets = async (incoming: ImagePicker.ImagePickerAsset[], source: 'camera' | 'gallery' | 'pending' | 'shareIntent' | 'dolab') => {
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

    const preparedAssets: ImagePicker.ImagePickerAsset[] = [];
    let hadRejected = false;

    for (const asset of incomingUniqueByUri) {
      const prepared = await prepareImageForUpload(asset, { enableOptimization: false });
      if (!prepared.ok) {
        hadRejected = true;
        continue;
      }
      preparedAssets.push(prepared.asset);
    }

    if (!preparedAssets.length) {
      if (hadRejected) setError('تم تجاهل بعض الملفات غير المدعومة.');
      return;
    }

    const persisted = await persistAddItemDraftMediaAssets(user?.id, preparedAssets);
    if (!persisted.length) return;

    setMediaState((prev) => {
      const { next, wasTrimmed } = mergeAssets(prev.assets, persisted);
      const acceptedUris = new Set(next.slice(prev.assets.length).map((asset) => asset.uri));
      const rejectedPersisted = persisted.filter((asset) => !acceptedUris.has(asset.uri));
      if (rejectedPersisted.length) {
        rejectedPersistedCleanupQueueRef.current.push(...rejectedPersisted);
      }

      const feedbackMessages: string[] = [];
      if (hadRejected) feedbackMessages.push('تم تجاهل بعض الملفات غير المدعومة.');
      if (wasTrimmed && source !== 'pending' && source !== 'dolab') feedbackMessages.push(`يمكنك إضافة ${MAX_ASSETS} صور كحد أقصى، تم إضافة المتاح فقط.`);

      return {
        assets: next,
        feedback: feedbackMessages.length ? feedbackMessages.join(' ') : null,
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

    const validation = await validateVideoTeaserAsset(selected);
    if (!validation.ok) {
      const mappedMessage = validation.message.includes('15 ثانية')
        ? 'فيديو اللمحة لازم يكون 15 ثانية أو أقل.'
        : validation.message.includes('كبير')
          ? 'فيديو اللمحة كبير جدًا. اختار فيديو أقصر أو أخف.'
          : validation.message.includes('فيديو')
            ? 'نوع الفيديو غير مدعوم.'
            : validation.message;
      setError(mappedMessage);
      return;
    }

    setVideoTeaser(validation.asset);
    const sizeBytes = validation.info?.sizeBytes
      ?? (typeof validation.asset.fileSize === 'number' ? validation.asset.fileSize : null);
    setVideoTeaserSizeLabel(sizeBytes != null ? formatVideoSizeLabel(sizeBytes) : null);
    setError(null);
  };

  const removeVideoTeaser = () => {
    setVideoTeaser(null);
    setVideoTeaserSizeLabel(null);
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
        if (!isSupportedImageAsset(a)) return 'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP للصور.';
      }
      if (videoTeaser) {
        if (videoTeaser.type !== 'video' && !videoTeaser.mimeType?.startsWith('video/')) return 'نوع الفيديو غير مدعوم.';
        if (videoTeaser.duration != null && videoTeaser.duration > 15_000) return 'فيديو اللمحة لازم يكون 15 ثانية أو أقل.';
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
      if (source === 'dolab' && dolabItemId && result.itemId) {
        const markResult = await markDolabItemPublished(user.id, dolabItemId, result.itemId);
        if (markResult.error && __DEV__) console.log('[add-item] dolab published mark failed', { message: markResult.error.message });
      }
      await clearAddItemDraft(user.id);
      await clearAddItemDraftMedia(user.id);
      setVideoTeaser(null);
      setHasSavedDraft(false);
      setDraftNotice(null);
      setProgress('تم نشر العنصر بنجاح.');
      void trackEvent('item_published', {
        route: '/(tabs)/add',
        entityType: 'item',
        entityId: result.itemId,
        metadata: {
          hasImages: assets.length > 0,
          hasVideo: Boolean(videoTeaser),
          categoryId: categoryId ?? null,
        },
      });
      router.push(`/item/${result.itemId}?moment=published`);
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
  const showDraftCard = !draftRecoveryDismissed && (draftNotice || hasSavedDraft);

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
    setDraftRecoveryDismissed(false);
  };

  const currentCondition = conditionOptions.find((option) => option.key === condition);
  const currentDesire = desireOptions.find((option) => option.key === desireMode);
  const currentCategory = categories.find((category) => category.id === categoryId)?.name_ar ?? null;

  return (
    <AppScreen scrollable backgroundVariant="alive" style={styles.screen}>
      <LinearGradient colors={['#FFF6EC', '#FFE8D3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroOrb} />
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}><Ionicons name="add" size={22} color={colors.primary} /></View>
          <View style={styles.heroCopy}>
            <AppText muted style={styles.eyebrow}>انشر حاجة للتبديل</AppText>
            <AppText weight="bold" style={styles.title}>ضيف عنصر جديد</AppText>
            <AppText muted style={styles.heroDescription}>هنمشي معاك خطوة بخطوة، والمسودة بتتحفظ تلقائيًا.</AppText>
          </View>
          {hasSavedDraft ? <View style={styles.savedPill}><Ionicons name="cloud-done-outline" size={14} color={colors.success} /><AppText style={styles.savedPillText}>محفوظ</AppText></View> : null}
        </View>

        <View style={styles.stepRail}>
          {steps.map((label, index) => {
            const active = index === step;
            const complete = index < step;
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: index > step }}
                disabled={index > step || submitting}
                onPress={() => { if (index < step) { setError(null); setStep(index); } }}
                style={styles.stepNode}
              >
                <View style={[styles.stepDot, active && styles.stepDotActive, complete && styles.stepDotComplete]}>
                  <Ionicons name={complete ? 'checkmark' : stepIcons[index]} size={13} color={active || complete ? colors.white : colors.textMuted} />
                </View>
                <AppText style={[styles.stepNodeLabel, active && styles.stepNodeLabelActive]} numberOfLines={1}>{label}</AppText>
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      <View style={styles.stepIntro}>
        <View style={styles.stepIntroIcon}><Ionicons name={stepIcons[step]} size={21} color={colors.primary} /></View>
        <View style={styles.stepIntroCopy}>
          <AppText muted style={styles.eyebrow}>الخطوة {step + 1} من {steps.length}</AppText>
          <AppText weight="bold" style={styles.stepTitle}>{steps[step]}</AppText>
          <AppText muted style={styles.stepDescription}>{stepDescriptions[step]}</AppText>
        </View>
      </View>

      {showDraftCard ? (
        <View style={styles.noticePanel}>
          <View style={styles.noticeHeading}><Ionicons name="bookmark-outline" size={18} color={colors.primary} /><View style={styles.noticeCopy}><AppText weight="semibold">عندك مسودة</AppText><AppText muted style={styles.noticeText}>{draftNotice ?? 'المسودة محفوظة وتقدر تكمل من مكانك.'}</AppText></View></View>
          <View style={styles.twoActions}><AppButton label="كمل المسودة" onPress={() => { setDraftRecoveryDismissed(true); setDraftNotice(null); setError(null); }} disabled={submitting} /><AppButton label="ابدأ من جديد" variant="neutral" onPress={() => { void discardDraftAndReset(); }} disabled={submitting} /></View>
        </View>
      ) : null}

      {dolabNotice ? <View style={styles.infoStrip}><Ionicons name="information-circle-outline" size={18} color={colors.accent} /><AppText style={styles.infoStripText}>{dolabNotice}</AppText></View> : null}
      {dolabImportChoicePending ? <View style={styles.noticePanel}><AppText weight="bold">لقيت مسودة موجودة</AppText><AppText muted>اختار إذا كنت عايز تستبدلها ببيانات العنصر من دولابك أو تكمل الحالية.</AppText><View style={styles.twoActions}><AppButton label="استيراد من الدولاب" onPress={() => { if (pendingDolabApply) void pendingDolabApply(); }} /><AppButton label="كمل الحالية" variant="neutral" onPress={() => { setDolabImportChoicePending(false); setDolabNotice('تم الإبقاء على المسودة الحالية بدون استيراد بيانات الدولاب.'); }} /></View></View> : null}
      {isDefinitelyOffline ? <View style={styles.offlineStrip}><Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} /><View style={styles.noticeCopy}><AppText weight="semibold">أنت أوفلاين</AppText><AppText muted style={styles.noticeText}>كمّل تجهيز الإعلان عادي؛ النشر نفسه هيحتاج إنترنت.</AppText></View></View> : null}
      {error ? <View style={styles.errorStrip}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}

      {step === 0 ? (
        <View style={styles.stepSurface}>
          <View style={styles.surfaceHeader}><View style={styles.surfaceHeaderCopy}><AppText weight="bold" style={styles.surfaceTitle}>صور الحاجة</AppText><AppText muted style={styles.surfaceDescription}>الصورة الأولى هي الغلاف. أضف من زاوية لحد أربع زوايا واضحة.</AppText></View><View style={styles.progressCount}><AppText weight="bold" style={styles.progressCountValue}>{assets.length}</AppText><AppText muted style={styles.progressCountLabel}>/ 4</AppText></View></View>

          {mediaState.feedback ? <View style={styles.inlineWarning}><Ionicons name="information-circle-outline" size={17} color={colors.primary} /><AppText style={styles.inlineWarningText}>{mediaState.feedback}</AppText></View> : null}

          {!assets.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="التقط صورة للعنصر" onPress={openItemPhotoStudio} style={({ pressed }) => [styles.photoDropzone, pressed && styles.pressed]}>
              <View style={styles.photoDropIcon}><Ionicons name="camera-outline" size={29} color={colors.primary} /></View>
              <AppText weight="bold" style={styles.photoDropTitle}>ابدأ بصورة الغلاف</AppText>
              <AppText muted style={styles.photoDropText}>إضاءة كويسة، خلفية بسيطة، والحاجة كاملة جوه الكادر.</AppText>
              <View style={styles.photoDropActions}><AppButton label="افتح الكاميرا" onPress={openItemPhotoStudio} disabled={submitting} /><AppButton label="اختار من المعرض" variant="neutral" onPress={pickFromGallery} disabled={submitting} /></View>
            </Pressable>
          ) : (
            <View style={styles.mediaStack}>
              <View style={styles.coverCard}>
                <Image source={{ uri: assets[0]?.uri }} style={styles.coverPreview} />
                <View style={styles.coverBadge}><Ionicons name="star" size={11} color={colors.white} /><AppText style={styles.coverBadgeText}>الغلاف</AppText></View>
                <View style={styles.coverActions}><Pressable onPress={() => openItemPhotoComposer(0)} disabled={submitting} style={styles.mediaAction}><Ionicons name="options-outline" size={15} color={colors.text} /><AppText style={styles.mediaActionText}>تهيئة</AppText></Pressable><Pressable onPress={() => removeAssetAt(0)} disabled={submitting} style={styles.mediaAction}><Ionicons name="trash-outline" size={15} color={colors.textMuted} /><AppText muted style={styles.mediaActionText}>حذف</AppText></Pressable></View>
              </View>
              <AppText muted style={styles.dragHint}>اضغط مطولًا واسحب لتغيير ترتيب الصور. أول صورة تفضل الغلاف.</AppText>
              <DraggableFlatList
                data={assets}
                keyExtractor={(item) => item.uri}
                horizontal
                containerStyle={styles.draggableList}
                contentContainerStyle={styles.draggableContent}
                onDragBegin={handleDragBegin}
                onDragEnd={handleDragEnd}
                renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<ImagePicker.ImagePickerAsset>) => {
                  const index = getIndex() ?? 0;
                  return (
                    <Pressable onLongPress={drag} disabled={submitting} style={[styles.thumbCard, index === 0 && styles.thumbCardCover, isActive && styles.thumbCardActive]}>
                      <Image source={{ uri: item.uri }} style={styles.thumbImage} />
                      <View style={styles.thumbFooter}><AppText muted style={styles.thumbNumber}>#{index + 1}</AppText><Pressable accessibilityRole="button" accessibilityLabel={`تهيئة الصورة ${index + 1}`} onPress={() => openItemPhotoComposer(index)}><Ionicons name="options-outline" size={16} color={colors.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`حذف الصورة ${index + 1}`} onPress={() => removeAssetAt(index)}><Ionicons name="close-circle-outline" size={17} color={colors.textMuted} /></Pressable></View>
                    </Pressable>
                  );
                }}
              />
              <View style={styles.twoActions}><AppButton label="صورة جديدة" onPress={openItemPhotoStudio} disabled={submitting || assets.length >= MAX_ASSETS} /><AppButton label="من المعرض" variant="neutral" onPress={pickFromGallery} disabled={submitting || assets.length >= MAX_ASSETS} /></View>
            </View>
          )}

          <View style={styles.surfaceDivider} />

          <View style={styles.videoSection}>
            <View style={styles.videoSectionTop}><View style={styles.videoSectionIcon}><Ionicons name="videocam-outline" size={20} color={colors.accent} /></View><View style={styles.videoSectionCopy}><View style={styles.labelRow}><AppText weight="bold">لمحة فيديو</AppText><View style={styles.optionalPill}><AppText style={styles.optionalText}>اختياري</AppText></View></View><AppText muted style={styles.surfaceDescription}>لحد 15 ثانية توضّح الحركة أو الحالة أحسن من الصور.</AppText></View></View>
            {videoTeaser ? (
              <View style={styles.videoReady}><View style={styles.videoReadyIcon}><Ionicons name="checkmark" size={19} color={colors.white} /></View><View style={styles.videoReadyCopy}><AppText weight="semibold">الفيديو جاهز</AppText><AppText muted style={styles.videoMeta}>{[videoTeaserDurationLabel, videoTeaserSizeLabel].filter(Boolean).join(' · ')}</AppText></View><Pressable accessibilityRole="button" accessibilityLabel="حذف فيديو اللمحة" onPress={removeVideoTeaser} style={styles.iconButton}><Ionicons name="trash-outline" size={17} color={colors.textMuted} /></Pressable></View>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="إضافة فيديو لمحة" onPress={pickVideoTeaser} style={({ pressed }) => [styles.videoEmpty, pressed && styles.pressed]}><Ionicons name="add-circle-outline" size={20} color={colors.accent} /><AppText weight="semibold" style={styles.videoEmptyText}>أضف لمحة قصيرة</AppText></Pressable>
            )}
            {videoTeaser ? <AppButton label="تغيير الفيديو" variant="neutral" onPress={pickVideoTeaser} disabled={submitting} /> : null}
            <AppText muted style={styles.microcopy}>فيديو اللمحة لا يُحفظ ضمن المسودة حاليًا، فاختاره قبل النشر النهائي.</AppText>
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.stepSurface}>
          <View style={styles.surfaceHeader}><View style={styles.surfaceHeaderCopy}><AppText weight="bold" style={styles.surfaceTitle}>عرّف الحاجة بسرعة</AppText><AppText muted style={styles.surfaceDescription}>عنوان واضح وفئة صحيحة أهم من وصف طويل.</AppText></View><View style={styles.surfaceHeaderIcon}><Ionicons name="cube-outline" size={20} color={colors.primary} /></View></View>
          <View style={styles.fieldGroup}><AppText weight="semibold" style={styles.fieldLabel}>اسم العنصر</AppText><AppInput value={title} onChangeText={setTitle} placeholder="مثال: سماعة Sony WH-1000XM4" /></View>
          <View style={styles.fieldGroup}><View style={styles.fieldHeading}><AppText weight="semibold" style={styles.fieldLabel}>الفئة</AppText><AppText muted style={styles.requiredHint}>مطلوبة</AppText></View><View style={styles.categoryWrap}>{categories.map((category) => <Pressable key={category.id} accessibilityRole="radio" accessibilityState={{ selected: categoryId === category.id }} onPress={() => setCategoryId(category.id)} style={[styles.categoryChip, categoryId === category.id && styles.categoryChipSelected]}><AppText style={[styles.categoryText, categoryId === category.id && styles.categoryTextSelected]}>{category.name_ar}</AppText>{categoryId === category.id ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}</Pressable>)}</View></View>
          <View style={styles.surfaceDivider} />
          <View style={styles.fieldGroup}><View style={styles.fieldHeading}><AppText weight="semibold" style={styles.fieldLabel}>المكان</AppText><AppText muted style={styles.requiredHint}>اختياري</AppText></View><View style={styles.locationGrid}><View style={styles.locationField}><AppInput value={city} onChangeText={(value) => { setCity(value); if (locationLatitude !== null || locationLongitude !== null) { setLocationLatitude(null); setLocationLongitude(null); } }} placeholder="المدينة" /></View><View style={styles.locationField}><AppInput value={area} onChangeText={(value) => { setArea(value); if (locationLatitude !== null || locationLongitude !== null) { setLocationLatitude(null); setLocationLongitude(null); } }} placeholder="المنطقة" /></View></View>
            <Pressable accessibilityRole="button" accessibilityLabel="املأ المدينة من موقعي" disabled={locationFillLoading || submitting} onPress={() => { void handleFillLocationFromDevice(); }} style={({ pressed }) => [styles.locationAssist, pressed && styles.pressed, (locationFillLoading || submitting) && styles.disabled]}><View style={styles.locationAssistIcon}><Ionicons name="navigate-outline" size={17} color={colors.primary} /></View><View style={styles.locationAssistCopy}><AppText weight="semibold">{locationFillLoading ? 'بنعرف موقعك...' : 'املأها من موقعي'}</AppText><AppText muted style={styles.microcopy}>استخدام مرة واحدة لتحسين العناصر القريبة منك.</AppText></View><Ionicons name="chevron-back" size={17} color={colors.textMuted} /></Pressable>
            {locationFillMessage ? <View style={styles.successStrip}><Ionicons name="checkmark-circle-outline" size={17} color={colors.success} /><AppText style={styles.successText}>{locationFillMessage}</AppText></View> : null}
            {locationFillError ? <View style={styles.errorStrip}><Ionicons name="alert-circle-outline" size={17} color={colors.danger} /><AppText style={styles.errorText}>{locationFillError}</AppText></View> : null}
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.stepSurface}>
          <View style={styles.surfaceHeader}><View style={styles.surfaceHeaderCopy}><AppText weight="bold" style={styles.surfaceTitle}>حالته إيه بالظبط؟</AppText><AppText muted style={styles.surfaceDescription}>اختار الأقرب للحقيقة. الصراحة هنا بتقلّل أسئلة وتبني ثقة.</AppText></View><View style={styles.surfaceHeaderIcon}><Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} /></View></View>
          <View style={styles.choiceList}>{conditionOptions.map((option) => { const selected = condition === option.key; return <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setCondition(option.key)} style={[styles.choiceCard, selected && styles.choiceCardSelected]}><View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}><Ionicons name={option.icon} size={20} color={selected ? colors.primary : colors.textMuted} /></View><View style={styles.choiceCopy}><AppText weight="semibold" style={styles.choiceTitle}>{option.label}</AppText><AppText muted style={styles.choiceDescription}>{option.description}</AppText></View><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View></Pressable>; })}</View>
          <View style={styles.surfaceDivider} />
          <View style={styles.fieldGroup}><View style={styles.fieldHeading}><AppText weight="semibold" style={styles.fieldLabel}>ملاحظات الحالة</AppText><AppText muted style={styles.requiredHint}>اختياري</AppText></View><AppInput value={conditionNotes} onChangeText={setConditionNotes} placeholder="مثال: خدش بسيط في الجانب" /></View>
          <View style={styles.fieldGroup}><AppText weight="semibold" style={styles.fieldLabel}>وصف مختصر</AppText><AppInput value={description} onChangeText={setDescription} placeholder="المواصفات أو أي حاجة مهمة قبل التبديل" multiline /></View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.stepSurface}>
          <View style={styles.surfaceHeader}><View style={styles.surfaceHeaderCopy}><AppText weight="bold" style={styles.surfaceTitle}>خلي الإعلان له سياق</AppText><AppText muted style={styles.surfaceDescription}>مش لازم تحكي رواية؛ سطرين مفيدين أحسن من تفاصيل كتير.</AppText></View><View style={styles.surfaceHeaderIcon}><Ionicons name="book-outline" size={20} color={colors.primary} /></View></View>
          <View style={styles.fieldGroup}><View style={styles.fieldHeading}><AppText weight="semibold" style={styles.fieldLabel}>قصة العنصر</AppText><AppText muted style={styles.counter}>{itemStory.length}/600</AppText></View><AppInput value={itemStory} onChangeText={setItemStory} placeholder="معاك من إمتى؟ استخدمته في إيه؟" multiline /></View>
          <View style={styles.fieldGroup}><View style={styles.fieldHeading}><AppText weight="semibold" style={styles.fieldLabel}>ليه بتبدّله؟</AppText><AppText muted style={styles.counter}>{swapReason.length}/240</AppText></View><AppInput value={swapReason} onChangeText={setSwapReason} placeholder="مثال: مش بستخدمه وبحتاج حاجة أنسب" /></View>
          <View style={styles.fieldGroup}><View style={styles.fieldHeading}><AppText weight="semibold" style={styles.fieldLabel}>مناسب لمين؟</AppText><AppText muted style={styles.counter}>{goodFor.length}/240</AppText></View><AppInput value={goodFor} onChangeText={setGoodFor} placeholder="مثال: مناسب لحد بيبدأ تصوير" /></View>
        </View>
      ) : null}

      {step === 4 ? (
        <View style={styles.stepSurface}>
          <View style={styles.surfaceHeader}><View style={styles.surfaceHeaderCopy}><AppText weight="bold" style={styles.surfaceTitle}>تحب تبدّله بإيه؟</AppText><AppText muted style={styles.surfaceDescription}>حدد طريقة استقبال العروض الأول، وبعدها اكتب تفضيلك لو عندك.</AppText></View><View style={styles.surfaceHeaderIcon}><Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} /></View></View>
          <View style={styles.choiceList}>{desireOptions.map((option) => { const selected = desireMode === option.key; return <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setDesireMode(option.key)} style={[styles.choiceCard, selected && styles.choiceCardSelected]}><View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}><Ionicons name={option.icon} size={20} color={selected ? colors.primary : colors.textMuted} /></View><View style={styles.choiceCopy}><AppText weight="semibold" style={styles.choiceTitle}>{option.label}</AppText><AppText muted style={styles.choiceDescription}>{option.description}</AppText></View><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View></Pressable>; })}</View>
          <View style={styles.surfaceDivider} />
          <View style={styles.fieldGroup}><AppText weight="semibold" style={styles.fieldLabel}>إيه اللي في بالك؟</AppText><AppInput value={desireText} onChangeText={setDesireText} placeholder={desireMode === 'specific' ? 'مثال: ساعة ذكية أو AirPods' : 'اكتب تفضيل لو عندك، أو سيبها مفتوحة'} /></View>
          <View style={styles.fieldGroup}><View style={styles.fieldHeading}><AppText weight="semibold" style={styles.fieldLabel}>وسوم تساعد المطابقة</AppText><AppText muted style={styles.requiredHint}>اختياري</AppText></View><AppInput value={wantedTags} onChangeText={setWantedTags} placeholder="إلكترونيات، تصوير، ألعاب..." /></View>
        </View>
      ) : null}

      {step === 5 ? (
        <View style={styles.reviewStack}>
          {publishFailure ? <View style={styles.errorPanel}><View style={styles.noticeHeading}><Ionicons name="alert-circle-outline" size={19} color={colors.danger} /><View style={styles.noticeCopy}><AppText weight="bold" style={styles.errorTitle}>النشر ماكملش</AppText><AppText style={styles.errorText}>{publishFailure}</AppText><AppText muted style={styles.noticeText}>المسودة محفوظة، مش محتاج تبدأ من الأول.</AppText></View></View><AppButton label="حاول تاني" onPress={submit} disabled={submitting} /></View> : null}
          <View style={styles.previewCard}>
            <View style={styles.previewMedia}>
              {reviewImages[0] ? <Image source={{ uri: reviewImages[0].uri }} style={styles.previewCover} /> : <View style={styles.previewPlaceholder}><Ionicons name="image-outline" size={30} color={colors.textMuted} /></View>}
              <View style={styles.previewTopBadge}><AppText style={styles.previewTopBadgeText}>جاهز للمراجعة</AppText></View>
              {videoTeaser ? <View style={styles.previewVideoBadge}><Ionicons name="play" size={12} color={colors.white} /><AppText style={styles.previewVideoText}>فيديو</AppText></View> : null}
            </View>
            <View style={styles.previewBody}>
              <AppText weight="bold" style={styles.previewTitle}>{title || 'عنوان العنصر'}</AppText>
              <View style={styles.previewMetaRow}>{currentCategory ? <View style={styles.previewPill}><AppText style={styles.previewPillText}>{currentCategory}</AppText></View> : null}{currentCondition ? <View style={styles.previewPill}><AppText style={styles.previewPillText}>{currentCondition.label}</AppText></View> : null}{city ? <View style={styles.previewPill}><Ionicons name="location-outline" size={11} color={colors.textMuted} /><AppText style={styles.previewPillText}>{area ? `${city} · ${area}` : city}</AppText></View> : null}</View>
              {description.trim() ? <AppText muted style={styles.previewDescription}>{description.trim()}</AppText> : null}
            </View>
          </View>

          <View style={styles.reviewDetails}>
            <View style={styles.reviewSection}><View style={styles.reviewSectionTitle}><Ionicons name="swap-horizontal-outline" size={17} color={colors.primary} /><AppText weight="bold">المقابل</AppText></View><AppText style={styles.reviewValue}>{currentDesire?.label ?? '-'}{desireText.trim() ? ` · ${desireText.trim()}` : ''}</AppText></View>
            {itemStory.trim() ? <View style={styles.reviewSection}><View style={styles.reviewSectionTitle}><Ionicons name="book-outline" size={17} color={colors.primary} /><AppText weight="bold">قصة العنصر</AppText></View><AppText muted style={styles.reviewLongText}>{itemStory.trim()}</AppText></View> : null}
            {conditionNotes.trim() ? <View style={styles.reviewSection}><View style={styles.reviewSectionTitle}><Ionicons name="information-circle-outline" size={17} color={colors.primary} /><AppText weight="bold">ملاحظات الحالة</AppText></View><AppText muted style={styles.reviewLongText}>{conditionNotes.trim()}</AppText></View> : null}
            {wantedTags.trim() ? <View style={styles.reviewSection}><View style={styles.reviewSectionTitle}><Ionicons name="pricetags-outline" size={17} color={colors.primary} /><AppText weight="bold">اهتمامات المقابل</AppText></View><AppText muted style={styles.reviewLongText}>{wantedTags.trim()}</AppText></View> : null}
          </View>
          {progress ? <View style={styles.publishProgress}><Ionicons name="cloud-upload-outline" size={17} color={colors.primary} /><View style={styles.noticeCopy}><AppText weight="semibold">بننشر العنصر</AppText><AppText muted style={styles.noticeText}>{progress}</AppText></View></View> : null}
        </View>
      ) : null}

      <View style={styles.footerPanel}>
        <View style={styles.footerCopy}><AppText muted style={styles.footerEyebrow}>{step === 5 ? 'آخر خطوة' : `بعدها: ${steps[Math.min(step + 1, 5)]}`}</AppText><AppText weight="semibold" style={styles.footerTitle}>{step === 5 ? 'راجع كل حاجة قبل النشر' : stepDescriptions[step]}</AppText></View>
        <View style={styles.footerActions}>
          {step > 0 ? <View style={styles.footerBack}><AppButton label="رجوع" variant="neutral" onPress={back} disabled={submitting} fullWidth /></View> : null}
          <View style={styles.footerNext}>{step < 5 ? <AppButton label={nextLabels[step] ?? 'التالي'} onPress={next} disabled={submitting} fullWidth /> : <AppButton label={submitting ? 'جارٍ النشر...' : 'انشر العنصر'} onPress={submit} disabled={submitting} loading={submitting} fullWidth />}</View>
        </View>
      </View>

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
        originalAsset={itemPhotoComposerTargetIndex !== null ? assets[itemPhotoComposerTargetIndex] ?? null : null}
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
          if (previousAsset?.uri) void deleteAddItemDraftMediaAsset(previousAsset);
          setMediaState((prev) => ({ ...prev, assets: prev.assets.map((asset, index) => index === assetIndex ? persistedComposed : asset), feedback: null }));
          setError(null);
          setItemPhotoComposerVisible(false);
          setItemPhotoComposerTargetIndex(null);
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.lg },
  hero: { borderRadius: radii.xl, padding: spacing.lg, gap: spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(184,98,63,0.12)' },
  heroOrb: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -65, top: -85, backgroundColor: 'rgba(255,255,255,0.42)' },
  heroTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  heroIcon: { width: 46, height: 46, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  heroCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 27, lineHeight: 34, textAlign: 'right' },
  heroDescription: { fontSize: 13, lineHeight: 20, textAlign: 'right' },
  savedPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.successSoft },
  savedPillText: { color: colors.success, fontSize: 10 },
  stepRail: { flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: 3 },
  stepNode: { flex: 1, alignItems: 'center', gap: 5 },
  stepDot: { width: 28, height: 28, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stepDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotComplete: { backgroundColor: colors.success, borderColor: colors.success },
  stepNodeLabel: { fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  stepNodeLabelActive: { color: colors.primary },
  stepIntro: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs },
  stepIntroIcon: { width: 46, height: 46, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  stepIntroCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  stepTitle: { fontSize: 22, lineHeight: 28 },
  stepDescription: { fontSize: 13, lineHeight: 19, textAlign: 'right' },
  noticePanel: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  noticeHeading: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  noticeCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  noticeText: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  twoActions: { flexDirection: 'row-reverse', gap: spacing.sm },
  infoStrip: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  infoStripText: { flex: 1, lineHeight: 19, textAlign: 'right' },
  offlineStrip: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: '#EEE7DF' },
  errorStrip: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  successStrip: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.successSoft },
  successText: { flex: 1, color: colors.success, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  inlineWarning: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  inlineWarningText: { flex: 1, color: colors.primary, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  stepSurface: { gap: spacing.lg, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  surfaceHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  surfaceHeaderCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  surfaceTitle: { fontSize: 19, lineHeight: 25, textAlign: 'right' },
  surfaceDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  surfaceHeaderIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  progressCount: { flexDirection: 'row-reverse', alignItems: 'baseline', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  progressCountValue: { color: colors.primary, fontSize: 18 },
  progressCountLabel: { fontSize: 11 },
  photoDropzone: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, borderRadius: radii.xl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(184,98,63,0.38)', backgroundColor: '#FFF9F4' },
  photoDropIcon: { width: 62, height: 62, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  photoDropTitle: { fontSize: 18, textAlign: 'center' },
  photoDropText: { maxWidth: 280, textAlign: 'center', lineHeight: 20 },
  photoDropActions: { width: '100%', gap: spacing.sm, marginTop: spacing.xs },
  mediaStack: { gap: spacing.md },
  coverCard: { position: 'relative', borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.background },
  coverPreview: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.border },
  coverBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.round, backgroundColor: 'rgba(28,25,23,0.74)' },
  coverBadgeText: { color: colors.white, fontSize: 10 },
  coverActions: { position: 'absolute', left: spacing.sm, bottom: spacing.sm, flexDirection: 'row-reverse', gap: spacing.xs },
  mediaAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radii.round, backgroundColor: 'rgba(255,255,255,0.92)' },
  mediaActionText: { fontSize: 10 },
  dragHint: { fontSize: 11, textAlign: 'right' },
  draggableList: { marginHorizontal: -spacing.xs },
  draggableContent: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  thumbCard: { width: 102, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 5, gap: 5, backgroundColor: colors.surface },
  thumbCardCover: { borderColor: colors.primary },
  thumbCardActive: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  thumbImage: { width: '100%', aspectRatio: 1, borderRadius: radii.md, backgroundColor: colors.border },
  thumbFooter: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  thumbNumber: { fontSize: 9 },
  surfaceDivider: { height: 1, backgroundColor: colors.border },
  videoSection: { gap: spacing.md },
  videoSectionTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  videoSectionIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  videoSectionCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  labelRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  optionalPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radii.round, backgroundColor: '#EEE7DF' },
  optionalText: { fontSize: 9, color: colors.textMuted },
  videoReady: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  videoReadyIcon: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  videoReadyCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  videoMeta: { fontSize: 11 },
  iconButton: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  videoEmpty: { minHeight: 54, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.background },
  videoEmptyText: { color: colors.accent },
  microcopy: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  fieldGroup: { gap: spacing.sm },
  fieldHeading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  fieldLabel: { fontSize: 13, textAlign: 'right' },
  requiredHint: { fontSize: 10 },
  categoryWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  categoryChipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  categoryText: { fontSize: 12 },
  categoryTextSelected: { color: colors.primary },
  locationGrid: { gap: spacing.sm },
  locationField: { flex: 1 },
  locationAssist: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  locationAssistIcon: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  locationAssistCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  choiceList: { gap: spacing.sm },
  choiceCard: { minHeight: 74, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  choiceCardSelected: { borderColor: colors.primary, backgroundColor: '#FFF8F3' },
  choiceIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  choiceIconSelected: { backgroundColor: colors.primarySoft },
  choiceCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  choiceTitle: { fontSize: 14, textAlign: 'right' },
  choiceDescription: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  radio: { width: 21, height: 21, borderRadius: radii.round, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: radii.round, backgroundColor: colors.primary },
  counter: { fontSize: 10 },
  reviewStack: { gap: spacing.md },
  errorPanel: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.dangerSoft },
  errorTitle: { color: colors.danger },
  previewCard: { borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  previewMedia: { aspectRatio: 4 / 3, backgroundColor: colors.background },
  previewCover: { width: '100%', height: '100%' },
  previewPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewTopBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.primary },
  previewTopBadgeText: { color: colors.white, fontSize: 10 },
  previewVideoBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: 'rgba(28,25,23,0.72)' },
  previewVideoText: { color: colors.white, fontSize: 10 },
  previewBody: { gap: spacing.sm, padding: spacing.lg },
  previewTitle: { fontSize: 21, textAlign: 'right' },
  previewMetaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  previewPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.round, backgroundColor: colors.background },
  previewPillText: { fontSize: 10, color: colors.textMuted },
  previewDescription: { lineHeight: 20, textAlign: 'right' },
  reviewDetails: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  reviewSection: { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.background },
  reviewSectionTitle: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  reviewValue: { textAlign: 'right' },
  reviewLongText: { lineHeight: 20, textAlign: 'right' },
  publishProgress: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  footerPanel: { gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl },
  footerCopy: { alignItems: 'flex-end', gap: 2 },
  footerEyebrow: { fontSize: 10 },
  footerTitle: { fontSize: 12, textAlign: 'right' },
  footerActions: { flexDirection: 'row-reverse', gap: spacing.sm },
  footerBack: { flex: 0.7 },
  footerNext: { flex: 1.3 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
