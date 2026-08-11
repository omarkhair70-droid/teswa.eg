import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
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

function SourceAction({ icon, label, hint, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; hint: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.sourceAction, disabled && styles.disabled, pressed && styles.pressed]}>
      <View style={styles.sourceIcon}><Ionicons name={icon} size={21} color={colors.primary} /></View>
      <View style={styles.sourceCopy}><AppText weight="semibold">{label}</AppText><AppText muted style={styles.sourceHint}>{hint}</AppText></View>
      <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
    </Pressable>
  );
}

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
      const toAppend = uniqueIncoming.slice(0, remaining).map((asset) => ({ key: `new:${asset.uri}`, kind: 'new' as const, asset, previewUri: asset.uri }));
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
        if (progress.phase === 'optimizing') setSaveProgress(`بنحسّن الصورة ${progress.current} من ${progress.total}...`);
        else if (progress.phase === 'uploading') setSaveProgress(`بنرفع الصورة ${progress.current} من ${progress.total}...`);
        else setSaveProgress('بنحفظ ترتيب الصور...');
      },
    });
    setSaving(false);
    setSaveProgress(null);
    if (!result.ok) return setError(result.message);
    setSuccess({ storageCleanupFailed: result.storageCleanupFailed });
  };

  const cover = draftImages[0];
  const statusLabel = useMemo(() => context?.status === 'active' ? 'نشط في السوق' : 'مؤرشف', [context?.status]);
  const remainingSlots = Math.max(MAX_IMAGES - draftImages.length, 0);

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لتعديل صور عناصرك." /></AppScreen>;
  if (!itemId) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد العنصر المطلوب تعديل صوره." /></AppScreen>;
  if (loading) return <AppScreen><View style={styles.centerState}><View style={styles.loadingIcon}><Ionicons name="images-outline" size={28} color={colors.primary} /></View><AppText weight="bold">بنحمّل صور العنصر...</AppText></View></AppScreen>;
  if (loadError) return <AppScreen><View style={styles.centerState}><AppText weight="bold">تعذر تحميل الصور</AppText><AppText muted>{loadError}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadData()} /></View></AppScreen>;
  if (notEditable || !context) return <AppScreen><View style={styles.centerState}><EmptyState title="لا يمكن تعديل صور هذا العنصر" description="قد يكون العنصر غير موجود، أو ليس ملكك، أو غير قابل للتعديل حالياً." /><AppButton label="العودة لإدارة عناصري" onPress={() => router.replace('/item/manage')} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.backButton} onPress={() => router.back()} disabled={saving}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText muted style={styles.eyebrow}>واجهة العنصر</AppText>
          <AppText weight="bold" style={styles.title}>اختار الصور اللي تحكي الحاجة صح</AppText>
          <AppText muted style={styles.headerDescription}>أول صورة هي الغلاف. اسحب الصور لتغيير الترتيب قبل الحفظ.</AppText>
        </View>
      </View>

      <View style={styles.itemStrip}>
        <View style={styles.itemIcon}><Ionicons name="cube-outline" size={21} color={colors.primary} /></View>
        <View style={styles.itemCopy}><AppText weight="bold" numberOfLines={2} style={styles.itemTitle}>{context.title}</AppText><View style={styles.itemMeta}><AppText muted style={styles.metaText}>{statusLabel}</AppText><AppText muted style={styles.metaText}>{draftImages.length}/{MAX_IMAGES} صور</AppText></View></View>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/item/edit/${itemId}`)} style={styles.dataShortcut}><Ionicons name="create-outline" size={18} color={colors.accent} /><AppText style={styles.dataShortcutText}>البيانات</AppText></Pressable>
      </View>

      {isDefinitelyOffline ? <View style={styles.offlineCard}><Ionicons name="cloud-offline-outline" size={20} color={colors.accent} /><AppText muted style={styles.offlineText}>تقدر ترتب الصور دلوقتي، لكن رفع صور جديدة والحفظ النهائي محتاجين إنترنت.</AppText></View> : null}
      {error ? <View style={styles.errorCard}><Ionicons name="alert-circle-outline" size={20} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}
      {success ? <View style={styles.successCard}><Ionicons name="checkmark-circle-outline" size={21} color={colors.success} /><View style={styles.successCopy}><AppText weight="bold" style={styles.successTitle}>الصور اتحفظت</AppText><AppText muted style={styles.successText}>{success.storageCleanupFailed ? 'الترتيب والصور الجديدة اتحفظوا، لكن في ملفات قديمة تعذر تنظيفها من التخزين.' : 'الغلاف والترتيب الجديد بقوا جاهزين على العنصر.'}</AppText></View></View> : null}

      {draftImages.length ? (
        <View style={styles.coverPanel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelIcon}><Ionicons name="image-outline" size={19} color={colors.primary} /></View>
            <View style={styles.panelCopy}><AppText muted style={styles.eyebrow}>الصورة الأولى</AppText><AppText weight="bold" style={styles.panelTitle}>غلاف العنصر</AppText></View>
            <View style={styles.coverBadge}><Ionicons name="star" size={13} color={colors.white} /><AppText style={styles.coverBadgeText}>الغلاف</AppText></View>
          </View>
          <Image source={{ uri: cover.previewUri }} style={styles.coverImage} />
          <View style={styles.coverHint}><Ionicons name="move-outline" size={18} color={colors.textMuted} /><AppText muted style={styles.coverHintText}>لو عايز غلاف تاني، اسحب صورته لأول الترتيب تحت.</AppText></View>
        </View>
      ) : (
        <View style={styles.emptyPanel}>
          <View style={styles.emptyIcon}><Ionicons name="images-outline" size={30} color={colors.primary} /></View>
          <AppText weight="bold" style={styles.emptyTitle}>العنصر محتاج صورة واحدة على الأقل</AppText>
          <AppText muted style={styles.emptyText}>ابدأ بصورة واضحة للحاجة من زاوية كويسة، وبعدها أضف لحد 4 صور.</AppText>
        </View>
      )}

      {draftImages.length ? (
        <View style={styles.orderPanel}>
          <View style={styles.panelHeader}>
            <View style={[styles.panelIcon, styles.panelIconAccent]}><Ionicons name="reorder-three-outline" size={20} color={colors.accent} /></View>
            <View style={styles.panelCopy}><AppText muted style={styles.eyebrow}>اضغط مطولًا واسحب</AppText><AppText weight="bold" style={styles.panelTitle}>رتّب الصور</AppText></View>
            <AppText muted style={styles.slotText}>{remainingSlots ? `${remainingSlots} مكان فاضي` : 'اكتملت الصور'}</AppText>
          </View>

          <DraggableFlatList
            data={draftImages}
            horizontal
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.thumbWrap}
            onDragBegin={() => {
              if (success) return;
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            }}
            onDragEnd={({ data }) => {
              if (success) return;
              setDraftImages(data);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            }}
            renderItem={({ item, drag, getIndex, isActive }: RenderItemParams<DraftImage>) => {
              const index = getIndex() ?? 0;
              return (
                <Pressable onLongPress={success ? undefined : drag} disabled={Boolean(success)} style={[styles.thumbCard, index === 0 && styles.coverThumb, isActive && styles.thumbActive]}>
                  <Image source={{ uri: item.previewUri }} style={styles.thumbImage} />
                  <View style={styles.thumbFooter}>
                    <View style={styles.indexBadge}><AppText style={styles.indexText}>{index + 1}</AppText></View>
                    {index === 0 ? <AppText style={styles.coverText}>غلاف</AppText> : <AppText muted style={styles.dragText}>اسحب للترتيب</AppText>}
                  </View>
                  {!success ? <Pressable accessibilityRole="button" accessibilityLabel={`حذف الصورة ${index + 1}`} onPress={() => setDraftImages((prev) => prev.filter((entry) => entry.key !== item.key))} style={styles.removeButton}><Ionicons name="trash-outline" size={15} color={colors.danger} /></Pressable> : null}
                </Pressable>
              );
            }}
          />
        </View>
      ) : null}

      <View style={styles.sourcePanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelIcon}><Ionicons name="add-circle-outline" size={20} color={colors.primary} /></View>
          <View style={styles.panelCopy}><AppText muted style={styles.eyebrow}>إضافة صورة</AppText><AppText weight="bold" style={styles.panelTitle}>{remainingSlots ? `لسه عندك ${remainingSlots} مكان` : 'وصلت للحد الأقصى'}</AppText></View>
        </View>
        <View style={styles.sourceList}>
          <SourceAction icon="camera-outline" label="صوّر دلوقتي" hint="استخدم الكاميرا وخد لقطة جديدة للحاجة." onPress={() => void pickFromCamera()} disabled={saving || Boolean(success) || draftImages.length >= MAX_IMAGES} />
          <SourceAction icon="images-outline" label="اختار من المعرض" hint="اختار صورة أو أكتر من الصور الموجودة عندك." onPress={() => void pickFromGallery()} disabled={saving || Boolean(success) || draftImages.length >= MAX_IMAGES} />
        </View>
      </View>

      {!success ? (
        <View style={styles.savePanel}>
          <View style={styles.saveCopy}><AppText weight="bold" style={styles.saveTitle}>{saving ? saveProgress || 'بنحفظ الصور...' : 'جاهز تحفظ الترتيب؟'}</AppText><AppText muted style={styles.saveDescription}>الحفظ يرفع الصور الجديدة ويحدّث الغلاف والترتيب في خطوة واحدة.</AppText></View>
          <View style={styles.saveActions}><AppButton label="إلغاء" variant="neutral" onPress={() => router.back()} disabled={saving} /><AppButton label={saving ? saveProgress || 'جارٍ الحفظ...' : 'حفظ الصور'} onPress={() => void onSave()} disabled={saving || isDefinitelyOffline || draftImages.length === 0} /></View>
        </View>
      ) : (
        <View style={styles.afterSaveActions}><AppButton label="العودة لإدارة عناصري" onPress={() => router.replace('/item/manage')} /><AppButton label="تعديل البيانات" variant="neutral" onPress={() => router.replace(`/item/edit/${itemId}`)} />{context.status === 'active' ? <AppButton label="عرض العنصر" variant="neutral" onPress={() => router.push(`/item/${itemId}`)} /> : null}</View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  loadingIcon: { width: 58, height: 58, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 42, height: 42, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  headerCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 27, lineHeight: 35, textAlign: 'right' },
  headerDescription: { lineHeight: 21, textAlign: 'right' },
  itemStrip: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  itemIcon: { width: 44, height: 44, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  itemTitle: { width: '100%', textAlign: 'right' },
  itemMeta: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  metaText: { fontSize: 10 },
  dataShortcut: { minHeight: 42, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  dataShortcutText: { fontSize: 10, color: colors.accent },
  offlineCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  offlineText: { flex: 1, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  errorCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, textAlign: 'right' },
  successCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.successSoft },
  successCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  successTitle: { color: colors.success },
  successText: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  coverPanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  panelHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  panelIcon: { width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  panelIconAccent: { backgroundColor: colors.accentSoft },
  panelCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  panelTitle: { fontSize: 18 },
  coverBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: radii.round, backgroundColor: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  coverBadgeText: { fontSize: 10, color: colors.white },
  coverImage: { width: '100%', height: 286, borderRadius: radii.xl, backgroundColor: colors.primarySoft },
  coverHint: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.background },
  coverHintText: { flex: 1, fontSize: 11, textAlign: 'right' },
  emptyPanel: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  emptyIcon: { width: 64, height: 64, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  orderPanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  slotText: { fontSize: 10 },
  thumbWrap: { gap: spacing.sm, paddingVertical: spacing.xs },
  thumbCard: { width: 142, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xs, gap: spacing.xs, backgroundColor: colors.background },
  coverThumb: { borderColor: colors.primary, backgroundColor: '#FFF8F3' },
  thumbActive: { opacity: 0.82, transform: [{ scale: 1.02 }] },
  thumbImage: { width: '100%', height: 104, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  thumbFooter: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  indexBadge: { width: 24, height: 24, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  indexText: { fontSize: 10 },
  coverText: { flex: 1, fontSize: 10, color: colors.primary, textAlign: 'right' },
  dragText: { flex: 1, fontSize: 9, textAlign: 'right' },
  removeButton: { position: 'absolute', top: 8, left: 8, width: 30, height: 30, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sourcePanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  sourceList: { gap: spacing.sm },
  sourceAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, minHeight: 68, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  sourceIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sourceCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sourceHint: { fontSize: 10, lineHeight: 15, textAlign: 'right' },
  savePanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.primarySoft, gap: spacing.md },
  saveCopy: { alignItems: 'flex-end', gap: 3 },
  saveTitle: { fontSize: 18, textAlign: 'right' },
  saveDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  saveActions: { gap: spacing.sm },
  afterSaveActions: { gap: spacing.sm },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
