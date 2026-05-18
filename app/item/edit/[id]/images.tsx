import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useAuth } from '@/lib/auth';
import { fetchEditableListingImagesContext, ListingImageDraftInput, updateListingImagesFromMobile, type EditableListingImagesContext, type UpdateListingImagesProgress } from '@/lib/edit-listing-images';

type DraftImage =
  | { key: string; kind: 'existing'; imageId: string; imageUrl: string; previewUri: string }
  | { key: string; kind: 'new'; asset: ImagePicker.ImagePickerAsset; previewUri: string };

const MAX_IMAGES = 4;

export default function EditListingImagesScreen() {
  const { user } = useAuth();
  const { isDefinitelyOffline } = useOfflineStatus();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const itemId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [context, setContext] = useState<EditableListingImagesContext | null>(null);
  const [draftImages, setDraftImages] = useState<DraftImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notEditable, setNotEditable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ storageCleanupFailed?: true } | null>(null);

  const loadData = useCallback(async () => {
    if (!itemId || !user?.id) return;
    setLoading(true);
    setLoadError(null);
    setNotEditable(false);
    setError(null);
    try {
      const data = await fetchEditableListingImagesContext(itemId, user.id);
      if (!data) {
        setNotEditable(true);
        setContext(null);
        setDraftImages([]);
      } else {
        setContext(data);
        setDraftImages(data.images.map((img) => ({ key: `existing:${img.id}`, kind: 'existing', imageId: img.id, imageUrl: img.imageUrl, previewUri: img.imageUrl })));
      }
    } catch {
      setLoadError('تعذر تحميل صور العنصر حالياً. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [itemId, user?.id]);

  useEffect(() => { void loadData(); }, [loadData]);


  const appendNewAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const validAssets = assets.filter((asset) => asset?.uri);
    if (!validAssets.length) return;

    setDraftImages((prev) => {
      if (prev.length >= MAX_IMAGES) return prev;

      const seenNewUris = new Set(prev.filter((img): img is Extract<DraftImage, { kind: 'new' }> => img.kind === 'new').map((img) => img.asset.uri));
      const uniqueIncoming: ImagePicker.ImagePickerAsset[] = [];
      const incomingSeen = new Set<string>();

      for (const asset of validAssets) {
        const uri = asset.uri;
        if (!uri || seenNewUris.has(uri) || incomingSeen.has(uri)) continue;
        incomingSeen.add(uri);
        uniqueIncoming.push(asset);
      }

      if (!uniqueIncoming.length) return prev;

      const remaining = Math.max(MAX_IMAGES - prev.length, 0);
      if (!remaining) return prev;

      const toAppend = uniqueIncoming.slice(0, remaining).map((asset) => ({
        key: `new:${asset.uri}`,
        kind: 'new' as const,
        asset,
        previewUri: asset.uri,
      }));

      return [...prev, ...toAppend];
    });
  };

  const pickFromCamera = async () => {
    const remaining = Math.max(MAX_IMAGES - draftImages.length, 0);
    if (!remaining) return setError('وصلت للحد الأقصى من الصور (4). احذف صورة لإضافة غيرها.');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return setError('نحتاج إذن الكاميرا لالتقاط صورة للعنصر.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setError(null);
    appendNewAssets([asset]);
  };

  const pickFromGallery = async () => {
    const remaining = Math.max(MAX_IMAGES - draftImages.length, 0);
    if (!remaining) return setError('وصلت للحد الأقصى من الصور (4). احذف صورة لإضافة غيرها.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.9 });
    if (result.canceled) return;
    setError(null);
    appendNewAssets(result.assets ?? []);
  };

  const onSave = async () => {
    if (!itemId || !user?.id || saving || isDefinitelyOffline) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    const orderedImages: ListingImageDraftInput[] = draftImages.map((img) => img.kind === 'existing' ? { kind: 'existing', imageId: img.imageId, imageUrl: img.imageUrl } : { kind: 'new', asset: img.asset });
    const result = await updateListingImagesFromMobile({
      itemId,
      ownerId: user.id,
      orderedImages,
      onProgress: (progress: UpdateListingImagesProgress) => {
        if (progress.phase === 'optimizing') setSaveProgress(`جارٍ تحسين الصورة ${progress.current} من ${progress.total}...`);
        else if (progress.phase === 'uploading') setSaveProgress(`جارٍ رفع الصورة ${progress.current} من ${progress.total}...`);
        else setSaveProgress('جارٍ حفظ ترتيب الصور...');
      },
    });
    setSaving(false);
    setSaveProgress(null);
    if (!result.ok) return setError(result.message);
    setSuccess({ storageCleanupFailed: result.storageCleanupFailed });
  };

  const cover = draftImages[0];
  const statusLabel = useMemo(() => context?.status === 'active' ? 'نشط' : 'مؤرشف', [context?.status]);

  if (!user) return <AppScreen><EmptyState title='تسجيل الدخول مطلوب' description='سجّل دخولك أولاً لتعديل صور عناصرِك.' /></AppScreen>;
  if (!itemId) return <AppScreen><EmptyState title='رابط غير صالح' description='تعذر تحديد العنصر المطلوب تعديل صوره.' /></AppScreen>;
  if (loading) return <AppScreen><AppText muted>جاري تحميل صور العنصر...</AppText></AppScreen>;
  if (loadError) return <AppScreen><AppCard><View style={styles.group}><AppText>{loadError}</AppText><AppButton label='إعادة المحاولة' variant='neutral' onPress={() => void loadData()} /></View></AppCard></AppScreen>;
  if (notEditable || !context) return <AppScreen><View style={styles.group}><EmptyState title='لا يمكن تعديل صور هذا العنصر' description='قد يكون العنصر غير موجود، أو ليس ملكك، أو غير قابل للتعديل حالياً.' /><AppButton label='العودة لإدارة عناصري' onPress={() => router.replace('/item/manage')} /></View></AppScreen>;

  return <AppScreen scrollable><View style={styles.content}>
    <AppCard><View style={styles.group}><AppText weight='bold' style={styles.title}>تعديل صور العنصر</AppText><AppText>{context.title}</AppText><AppText muted>الحالة الحالية: {statusLabel}</AppText><AppText muted>أعد ترتيب الصور وحدد الغلاف. الصورة الأولى ستظهر كغلاف للعنصر.</AppText><AppText muted>{draftImages.length} من 4 صور</AppText></View></AppCard>
    {isDefinitelyOffline ? <AppCard><AppText muted>أنت غير متصل بالإنترنت. يمكنك ترتيب الصور محلياً، لكن الحفظ ورفع الصور يحتاجان اتصالاً.</AppText></AppCard> : null}
    {error ? <AppCard><AppText style={styles.errorText}>{error}</AppText></AppCard> : null}
    {success ? <AppCard><View style={styles.group}><AppText weight='semibold'>تم حفظ صور العنصر بنجاح.</AppText>{success.storageCleanupFailed ? <AppText muted>تم الحفظ، لكن تعذر تنظيف بعض الملفات القديمة من التخزين.</AppText> : null}<AppButton label='العودة لإدارة عناصري' onPress={() => router.replace('/item/manage')} /><AppButton label='العودة لتعديل البيانات' variant='neutral' onPress={() => router.replace(`/item/edit/${itemId}`)} />{context.status === 'active' ? <AppButton label='عرض العنصر' variant='neutral' onPress={() => router.push(`/item/${itemId}`)} /> : null}</View></AppCard> : null}

    <AppCard><View style={styles.group}>{!draftImages.length ? <View style={styles.group}><EmptyState title='أضف صورة واضحة للعنصر' description='يجب الاحتفاظ بصورة واحدة على الأقل، ويمكنك استخدام 4 صور كحد أقصى.' /><View style={styles.actions}><AppButton label='التقط صورة' onPress={pickFromCamera} disabled={saving || Boolean(success)} /><AppButton label='اختر من المعرض' variant='neutral' onPress={pickFromGallery} disabled={saving || Boolean(success)} /></View></View> : <View style={styles.group}><View style={styles.coverCard}><Image source={{ uri: cover.previewUri }} style={styles.coverImage} /><View style={styles.coverBadge}><AppText style={styles.coverBadgeText}>الغلاف</AppText></View></View><AppText muted>اضغط مطولاً واسحب لإعادة ترتيب الصور.</AppText><DraggableFlatList data={draftImages} horizontal keyExtractor={(item) => item.key} contentContainerStyle={styles.thumbWrap} onDragBegin={() => { if (success) return; void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); }} onDragEnd={({ data }) => { if (success) return; setDraftImages(data); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); }} renderItem={({ item, drag, getIndex, isActive }: RenderItemParams<DraftImage>) => { const index = getIndex() ?? 0; return <Pressable onLongPress={success ? undefined : drag} disabled={Boolean(success)} style={[styles.thumbCard, index === 0 && styles.coverThumb, isActive && styles.thumbActive]}><Image source={{ uri: item.previewUri }} style={styles.thumbImage} /><View style={styles.thumbMeta}><AppText muted>#{index + 1}</AppText>{index === 0 ? <View style={styles.coverBadge}><AppText style={styles.coverBadgeText}>الغلاف</AppText></View> : null}</View><Pressable onPress={() => !success && setDraftImages((prev) => prev.filter((entry) => entry.key !== item.key))} disabled={Boolean(success)} style={styles.remove}><AppText muted>حذف</AppText></Pressable></Pressable>; }} /><View style={styles.actions}><AppButton label='التقط صورة' onPress={pickFromCamera} disabled={saving || Boolean(success) || draftImages.length >= MAX_IMAGES} /><AppButton label='اختر من المعرض' variant='neutral' onPress={pickFromGallery} disabled={saving || Boolean(success) || draftImages.length >= MAX_IMAGES} /></View></View>}</View></AppCard>

    {!success ? <View style={styles.actions}><AppButton label='إلغاء' variant='neutral' onPress={() => router.back()} disabled={saving} /><AppButton label={saving ? saveProgress || 'جارٍ حفظ الصور...' : 'حفظ الصور'} onPress={() => void onSave()} disabled={saving || isDefinitelyOffline} /></View> : null}
  </View></AppScreen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  title: { fontSize: 22 },
  errorText: { color: '#B42318' },
  actions: { gap: spacing.xs },
  coverCard: { position: 'relative' },
  coverImage: { width: '100%', height: 220, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  coverBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm, borderRadius: radii.round, backgroundColor: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  coverBadgeText: { color: colors.white },
  thumbWrap: { gap: spacing.sm, paddingVertical: spacing.xs },
  thumbCard: { width: 130, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.xs, gap: spacing.xs, backgroundColor: colors.white },
  coverThumb: { borderColor: colors.primary },
  thumbActive: { opacity: 0.85 },
  thumbImage: { width: '100%', height: 92, borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  thumbMeta: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  remove: { borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' },
});
