import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
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

export default function AddScreen() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [mediaState, setMediaState] = useState<{ assets: ImagePicker.ImagePickerAsset[]; feedback: string | null }>({ assets: [], feedback: null });
  const [categories, setCategories] = useState<{ id: string; name_ar: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good_used');
  const [conditionNotes, setConditionNotes] = useState('');
  const [description, setDescription] = useState('');
  const [itemStory, setItemStory] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [goodFor, setGoodFor] = useState('');
  const [desireMode, setDesireMode] = useState<'specific' | 'flexible' | 'surprise'>('flexible');
  const [desireText, setDesireText] = useState('');
  const [wantedTags, setWantedTags] = useState('');
  const assets = mediaState.assets;

  useEffect(() => {
    fetchActiveCategories()
      .then(setCategories)
      .catch((err) => {
        if (__DEV__) console.log('[add-item] categories load failed', { code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
        setCategories([]);
      });
  }, []);

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

  const appendAssets = (incoming: ImagePicker.ImagePickerAsset[], source: 'camera' | 'gallery' | 'pending') => {
    if (!incoming.length) return;

    setMediaState((prev) => {
      const { next, wasTrimmed } = mergeAssets(prev.assets, incoming);
      return {
        assets: next,
        feedback: wasTrimmed && source !== 'pending' ? `يمكنك إضافة ${MAX_ASSETS} صور كحد أقصى، تم إضافة المتاح فقط.` : null,
      };
    });
  };

  useEffect(() => {
    let mounted = true;

    const recoverPendingPicker = async () => {
      try {
        const pending = await ImagePicker.getPendingResultAsync();
        if (!mounted || !pending || !('canceled' in pending) || pending.canceled || 'code' in pending) return;
        appendAssets(pending.assets ?? [], 'pending');
      } catch (err) {
        if (__DEV__) console.log('[add-item] pending picker recovery failed', { code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      }
    };

    recoverPendingPicker();

    return () => {
      mounted = false;
    };
  }, []);

  const pickFromCamera = async () => {
    const remaining = Math.max(MAX_ASSETS - assets.length, 0);
    if (!remaining) {
      setError('وصلت للحد الأقصى من الصور (4). احذف صورة لإضافة غيرها.');
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('نحتاج إذن الكاميرا لالتقاط صورة للعنصر.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled) return;
      setError(null);
      appendAssets(result.assets ?? [], 'camera');
    } catch (err) {
      if (__DEV__) console.log('[add-item] camera picker failed', { code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر فتح الكاميرا حالياً. حاول مرة أخرى.');
    }
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
    appendAssets(result.assets ?? [], 'gallery');
  };

  const removeAssetAt = (index: number) => {
    setMediaState((prev) => ({ ...prev, assets: prev.assets.filter((_, i) => i !== index), feedback: null }));
  };

  const moveAsset = (index: number, direction: -1 | 1) => {
    setMediaState((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.assets.length) return prev;
      const next = [...prev.assets];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return { ...prev, assets: next, feedback: null };
    });
  };

  const validateCurrentStep = () => {
    if (step === 0) {
      if (!assets.length) return 'اختر صورة واحدة على الأقل.';
      if (assets.length > 4) return 'الحد الأقصى 4 صور.';
      for (const a of assets) {
        if (a.fileSize && a.fileSize > 5 * 1024 * 1024) return 'حجم الصورة يجب ألا يتجاوز 5MB.';
        if (a.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(a.mimeType)) return 'نوع الصورة غير مدعوم.';
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
    setSubmitting(true);
    setError(null);
    setProgress('جارٍ تحسين الصور...');
    try {
      const totalAssets = assets.length;
      const result = await publishItem(
        {
          title: title.trim(),
          categoryId,
          city: city.trim() || null,
          area: area.trim() || null,
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
          setProgress(`جارٍ رفع الصورة ${progressState.current} من ${total}...`);
        },
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setProgress('تم نشر العنصر بنجاح.');
      router.push(`/item/${result.itemId}`);
    } catch (err) {
      if (__DEV__) console.log('[add-item] submit failed', { userId: user.id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر نشر العنصر حالياً. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
      setProgress('');
    }
  };

  const reviewImages = useMemo(() => assets, [assets]);

  return <AppScreen scrollable><View style={styles.headerCard}><View style={styles.header}><AppText weight='bold' style={styles.title}>نشر عنصر جديد</AppText><AppText muted>الخطوة {step + 1} من 6 — {steps[step]}</AppText></View><View style={styles.progressTrack}>{steps.map((_, i) => <View key={`step-dot-${i}`} style={[styles.progressDot, i < step && styles.progressDotCompleted, i === step && styles.progressDotCurrent]} />)}</View></View>
    {error && <AppCard><AppText style={styles.error}>{error}</AppText></AppCard>}
    {step === 0 && !!mediaState.feedback && <AppCard><AppText style={styles.error}>{mediaState.feedback}</AppText></AppCard>}
    {step === 0 && <AppCard><View style={styles.gap}><View style={styles.sectionHeader}><AppText weight='bold'>صور العنصر</AppText><AppText muted>{assets.length} من 4 صور</AppText></View>{!assets.length ? <View style={styles.emptyMedia}><AppText weight='bold'>ابدأ بصورة واضحة لعنصرك</AppText><AppText muted>أضف حتى 4 صور، والصورة الأولى ستظهر كغلاف.</AppText><View style={styles.actions}><AppButton label='التقط صورة' onPress={pickFromCamera} disabled={submitting} /><AppButton label='اختر من المعرض' variant='neutral' onPress={pickFromGallery} disabled={submitting} /></View></View> : <View style={styles.gap}><View style={styles.coverCard}><Image source={{ uri: assets[0]?.uri }} style={styles.coverPreview} /><View style={styles.coverBadge}><AppText style={styles.coverBadgeText}>الغلاف</AppText></View><View style={styles.mediaActionRow}><Pressable onPress={() => removeAssetAt(0)} disabled={submitting} style={styles.mediaPill}><AppText muted>حذف</AppText></Pressable><Pressable onPress={() => moveAsset(0, 1)} disabled={assets.length === 1 || submitting} style={[styles.mediaPill, (assets.length === 1 || submitting) && styles.pillDisabled]}><AppText muted>التالي</AppText></Pressable></View></View>{assets.slice(1).length > 0 && <View style={styles.galleryGrid}>{assets.slice(1).map((a, idx) => { const realIndex = idx + 1; return <View key={a.uri} style={styles.galleryItem}><Image source={{ uri: a.uri }} style={styles.galleryPreview} /><AppText muted>#{realIndex + 1}</AppText><View style={styles.mediaActionRow}><Pressable onPress={() => moveAsset(realIndex, -1)} disabled={submitting} style={[styles.mediaPill, submitting && styles.pillDisabled]}><AppText muted>أسبق</AppText></Pressable><Pressable onPress={() => moveAsset(realIndex, 1)} disabled={realIndex === assets.length - 1 || submitting} style={[styles.mediaPill, (realIndex === assets.length - 1 || submitting) && styles.pillDisabled]}><AppText muted>التالي</AppText></Pressable><Pressable onPress={() => removeAssetAt(realIndex)} disabled={submitting} style={[styles.mediaPill, submitting && styles.pillDisabled]}><AppText muted>حذف</AppText></Pressable></View></View>; })}</View>}<View style={styles.actions}><AppButton label='التقط صورة' onPress={pickFromCamera} disabled={submitting || assets.length >= 4} /><AppButton label='اختر من المعرض' variant='neutral' onPress={pickFromGallery} disabled={submitting || assets.length >= 4} /></View></View>}<AppText muted>اختر من 1 إلى 4 صور.</AppText></View></AppCard>}
    {step === 1 && <AppCard><View style={styles.gap}><View style={styles.sectionHeader}><AppText weight='bold'>تعريف الحاجة</AppText><AppText muted>أضف الأساسيات التي تساعد على الفهم السريع.</AppText></View><AppInput value={title} onChangeText={setTitle} placeholder='عنوان العنصر *' />
      <View style={styles.rowWrap}>{categories.map((c) => <Pressable key={c.id} onPress={() => setCategoryId(c.id)} style={[styles.chip, categoryId === c.id && styles.chipSelected]}><AppText>{c.name_ar}</AppText></Pressable>)}</View>
      <AppInput value={city} onChangeText={setCity} placeholder='المدينة (اختياري)' /><AppInput value={area} onChangeText={setArea} placeholder='المنطقة (اختياري)' /></View></AppCard>}
    {step === 2 && <AppCard><View style={styles.gap}><View style={styles.sectionHeader}><AppText weight='bold'>حالة العنصر</AppText><AppText muted>اختر الحالة بدقة لرفع الثقة.</AppText></View><View style={styles.rowWrap}>{conditionOptions.map((c) => <Pressable key={c.key} onPress={() => setCondition(c.key)} style={[styles.chip, condition === c.key && styles.chipSelected]}><AppText>{c.label}</AppText></Pressable>)}</View><AppInput value={conditionNotes} onChangeText={setConditionNotes} placeholder='ملاحظات الحالة' /><AppInput value={description} onChangeText={setDescription} placeholder='الوصف' multiline /></View></AppCard>}
    {step === 3 && <AppCard><View style={styles.gap}><View style={styles.sectionHeader}><AppText weight='bold'>قصة العنصر</AppText><AppText muted>تفاصيل مختصرة تساعد الطرف الآخر على القرار.</AppText></View><AppInput value={itemStory} onChangeText={setItemStory} placeholder='قصة العنصر (حد 600)' multiline /><AppText muted>{itemStory.length}/600</AppText><AppInput value={swapReason} onChangeText={setSwapReason} placeholder='سبب المبادلة (حد 240)' /><AppText muted>{swapReason.length}/240</AppText><AppInput value={goodFor} onChangeText={setGoodFor} placeholder='مفيد لمن؟ (حد 240)' /><AppText muted>{goodFor.length}/240</AppText></View></AppCard>}
    {step === 4 && <AppCard><View style={styles.gap}><View style={styles.sectionHeader}><AppText weight='bold'>المقابل المطلوب</AppText><AppText muted>حدّد تفضيلك بشكل واضح وبسيط.</AppText></View><View style={styles.rowWrap}>{desireOptions.map((d) => <Pressable key={d.key} onPress={() => setDesireMode(d.key)} style={[styles.chip, desireMode === d.key && styles.chipSelected]}><AppText>{d.label}</AppText></Pressable>)}</View><AppInput value={desireText} onChangeText={setDesireText} placeholder='ماذا تريد بالمقابل؟' /><AppInput value={wantedTags} onChangeText={setWantedTags} placeholder='وسوم مطلوبة مفصولة بفواصل' /></View></AppCard>}
    {step === 5 && <AppCard><View style={styles.gap}><View style={styles.sectionHeader}><AppText weight='bold'>مراجعة قبل النشر</AppText><AppText muted>تأكد من التفاصيل والصور قبل الإرسال.</AppText></View><View style={styles.reviewCover}><Image source={{ uri: reviewImages[0]?.uri }} style={styles.reviewCoverImage} />{reviewImages[0] && <View style={styles.coverBadge}><AppText style={styles.coverBadgeText}>صورة الغلاف</AppText></View>}</View>{reviewImages.length > 1 && <View style={styles.row}>{reviewImages.slice(1).map((a) => <Image key={a.uri} source={{ uri: a.uri }} style={styles.preview} />)}</View>}<View style={styles.summaryBox}><AppText>العنوان: {title || '-'}</AppText><AppText>المدينة/المنطقة: {city || '-'} / {area || '-'}</AppText><AppText>الحالة: {conditionOptions.find((c) => c.key === condition)?.label || '-'}</AppText><AppText>المقابل: {desireOptions.find((d) => d.key === desireMode)?.label || '-'} {desireText ? `- ${desireText}` : ''}</AppText><AppText>الوسوم: {wantedTags || '-'}</AppText></View>{!!progress && <AppText muted>{progress}</AppText>}</View></AppCard>}
    <View style={styles.actions}><AppButton label='السابق' variant='neutral' onPress={back} disabled={step === 0 || submitting} />{step < 5 ? <AppButton label='التالي' onPress={next} disabled={submitting} /> : <AppButton label='انشر العنصر' onPress={submit} disabled={submitting} />}</View>
  </AppScreen>;
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  headerCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.sm, gap: spacing.sm },
  title: { fontSize: 24 },
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.border },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  actions: { flexDirection: 'row', gap: spacing.sm },
  error: { color: colors.primary },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mediaMeta: { flex: 1, gap: spacing.xs },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressDot: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border },
  progressDotCompleted: { backgroundColor: colors.primary },
  progressDotCurrent: { backgroundColor: colors.accent },
  sectionHeader: { gap: 2 },
  emptyMedia: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 14, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.primarySoft },
  coverCard: { position: 'relative', gap: spacing.xs },
  coverPreview: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.border },
  coverBadge: { position: 'absolute', top: spacing.xs, left: spacing.xs, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  coverBadgeText: { color: colors.surface, fontSize: 12 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  galleryItem: { width: '48%', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.xs, gap: spacing.xs, backgroundColor: colors.surface },
  galleryPreview: { width: '100%', aspectRatio: 1.4, borderRadius: 10, backgroundColor: colors.border },
  mediaActionRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  mediaPill: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.background },
  pillDisabled: { opacity: 0.45 },
  reviewCover: { position: 'relative' },
  reviewCoverImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: colors.border },
  summaryBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.background },
});
