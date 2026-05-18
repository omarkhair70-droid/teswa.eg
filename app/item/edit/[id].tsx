import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchEditableListingById, type EditableListing, updateListingCoreFields } from '@/lib/edit-listing';
import { DesireMode, fetchActiveCategories, ItemCondition } from '@/lib/publish-item';

const conditionOptions: { key: ItemCondition; label: string }[] = [
  { key: 'almost_new', label: 'شبه جديد' },
  { key: 'good_used', label: 'مستعمل بحالة جيدة' },
  { key: 'minor_issues', label: 'به ملاحظات بسيطة' },
  { key: 'needs_repair', label: 'يحتاج إصلاح' },
];
const desireOptions: { key: DesireMode; label: string }[] = [
  { key: 'specific', label: 'محدد' },
  { key: 'flexible', label: 'مرن' },
  { key: 'surprise', label: 'مفاجأة' },
];

export default function EditListingScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const itemId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [listing, setListing] = useState<EditableListing | null>(null);
  const [categories, setCategories] = useState<{ id: string; name_ar: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
  const [desireMode, setDesireMode] = useState<DesireMode>('flexible');
  const [desireText, setDesireText] = useState('');
  const [wantedTagsText, setWantedTagsText] = useState('');

  const hydrateForm = useCallback((data: EditableListing) => {
    setTitle(data.title);
    setCategoryId(data.categoryId);
    setCity(data.city ?? '');
    setArea(data.area ?? '');
    setCondition(data.condition);
    setConditionNotes(data.conditionNotes ?? '');
    setDescription(data.description ?? '');
    setItemStory(data.itemStory ?? '');
    setSwapReason(data.swapReason ?? '');
    setGoodFor(data.goodFor ?? '');
    setDesireMode(data.desireMode);
    setDesireText(data.desireText ?? '');
    setWantedTagsText(data.wantedTags.join(', '));
  }, []);

  const loadData = useCallback(async () => {
    if (!user?.id || !itemId) return;
    setLoading(true);
    setLoadError(null);
    setError(null);
    setSuccess(false);
    try {
      const [loadedListing, loadedCategories] = await Promise.all([
        fetchEditableListingById(itemId, user.id),
        fetchActiveCategories().catch(() => []),
      ]);
      setListing(loadedListing);
      setCategories(loadedCategories);
      if (loadedListing) hydrateForm(loadedListing);
    } catch (err) {
      if (__DEV__) console.log('[edit-listing] load failed', err);
      setLoadError('تعذر تحميل بيانات العنصر حالياً. حاول مرة أخرى.');
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [hydrateForm, itemId, user?.id]);

  useEffect(() => {
    if (!user?.id || !itemId) {
      setLoading(false);
      return;
    }
    void loadData();
  }, [itemId, loadData, user?.id]);

  const validationError = useMemo(() => {
    if (!title.trim()) return 'عنوان العنصر مطلوب.';
    if (categories.length > 0 && !categoryId) return 'يرجى اختيار التصنيف.';
    if (itemStory.trim().length > 600) return 'قصة العنصر يجب ألا تتجاوز 600 حرف.';
    if (swapReason.trim().length > 240) return 'سبب المبادلة يجب ألا يتجاوز 240 حرف.';
    if (goodFor.trim().length > 240) return 'مفيد لمن يجب ألا يتجاوز 240 حرف.';
    return null;
  }, [title, categories.length, categoryId, itemStory, swapReason, goodFor]);

  const handleSave = async () => {
    if (!user?.id || !itemId || saving) return;
    setError(null);
    setSuccess(false);
    if (validationError) return setError(validationError);
    setSaving(true);

    const result = await updateListingCoreFields({
      itemId,
      ownerId: user.id,
      payload: {
        title,
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
        wantedTags: wantedTagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
      },
    });

    setSaving(false);
    if (!result.ok) return setError(result.message);
    setSuccess(true);
  };

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لتعديل عناصرِك." /></AppScreen>;
  if (!itemId) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد العنصر المطلوب تعديله." /></AppScreen>;
  if (loading) return <AppScreen><AppText muted>جاري تحميل بيانات العنصر...</AppText></AppScreen>;
  if (loadError) return <AppScreen><AppCard><View style={styles.group}><AppText>{loadError}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadData()} /></View></AppCard></AppScreen>;
  if (!listing) return <AppScreen><View style={styles.group}><EmptyState title="لا يمكن تعديل هذا العنصر" description="قد يكون العنصر غير موجود، أو ليس ملكك، أو غير قابل للتعديل حالياً." /><AppButton label="العودة لإدارة عناصري" onPress={() => router.replace('/item/manage')} /></View></AppScreen>;

  return <AppScreen scrollable><View style={styles.content}><AppCard><View style={styles.group}><AppText weight="bold" style={styles.sectionTitle}>تعديل بيانات العنصر</AppText><AppText muted>عدّل المعلومات الأساسية دون تغيير الصور في هذه المرحلة.</AppText><AppText muted>الحالة الحالية: {listing.status === 'active' ? 'نشط' : 'مؤرشف'}</AppText><AppButton label='تعديل الصور' variant='neutral' onPress={() => router.push(`/item/edit/${listing.id}/images`)} /></View></AppCard>
    {error ? <AppCard><AppText style={styles.errorText}>{error}</AppText></AppCard> : null}
    {success ? <AppCard><View style={styles.group}><AppText weight="semibold">تم حفظ تعديلات العنصر بنجاح.</AppText><AppButton label="العودة لإدارة عناصري" onPress={() => router.replace('/item/manage')} />{listing.status === 'active' ? <AppButton label="عرض العنصر" variant="neutral" onPress={() => router.push(`/item/${listing.id}`)} /> : null}</View></AppCard> : null}

    <AppCard><View style={styles.group}><AppText weight="semibold">تعريف العنصر</AppText><AppInput value={title} onChangeText={setTitle} placeholder="عنوان العنصر" editable={!saving} /><View style={styles.chipWrap}>{categories.map((cat) => <Pressable key={cat.id} style={[styles.chip, categoryId === cat.id && styles.chipActive]} onPress={() => !saving && setCategoryId(cat.id)} disabled={saving}><AppText style={categoryId === cat.id ? styles.chipTextActive : undefined}>{cat.name_ar}</AppText></Pressable>)}</View><AppInput value={city} onChangeText={setCity} placeholder="المدينة" editable={!saving} /><AppInput value={area} onChangeText={setArea} placeholder="المنطقة" editable={!saving} /></View></AppCard>
    <AppCard><View style={styles.group}><AppText weight="semibold">حالة العنصر</AppText><View style={styles.chipWrap}>{conditionOptions.map((option) => <Pressable key={option.key} style={[styles.chip, condition === option.key && styles.chipActive]} onPress={() => !saving && setCondition(option.key)} disabled={saving}><AppText style={condition === option.key ? styles.chipTextActive : undefined}>{option.label}</AppText></Pressable>)}</View><AppInput value={conditionNotes} onChangeText={setConditionNotes} placeholder="ملاحظات الحالة" editable={!saving} /><AppInput value={description} onChangeText={setDescription} placeholder="وصف إضافي" multiline numberOfLines={4} editable={!saving} /></View></AppCard>
    <AppCard><View style={styles.group}><AppText weight="semibold">قصة العنصر</AppText><AppInput value={itemStory} onChangeText={setItemStory} placeholder="قصة العنصر" multiline numberOfLines={5} editable={!saving} /><AppText muted>{itemStory.trim().length}/600</AppText><AppInput value={swapReason} onChangeText={setSwapReason} placeholder="سبب المبادلة" editable={!saving} /><AppText muted>{swapReason.trim().length}/240</AppText><AppInput value={goodFor} onChangeText={setGoodFor} placeholder="مفيد لمن" editable={!saving} /><AppText muted>{goodFor.trim().length}/240</AppText></View></AppCard>
    <AppCard><View style={styles.group}><AppText weight="semibold">المقابل المطلوب</AppText><View style={styles.chipWrap}>{desireOptions.map((option) => <Pressable key={option.key} style={[styles.chip, desireMode === option.key && styles.chipActive]} onPress={() => !saving && setDesireMode(option.key)} disabled={saving}><AppText style={desireMode === option.key ? styles.chipTextActive : undefined}>{option.label}</AppText></Pressable>)}</View><AppInput value={desireText} onChangeText={setDesireText} placeholder="تفاصيل المقابل" editable={!saving} /><AppInput value={wantedTagsText} onChangeText={setWantedTagsText} placeholder="وسوم مطلوبة (افصل بينها بفاصلة)" editable={!saving} /></View></AppCard>
    <View style={styles.footerActions}><AppButton label="إلغاء" variant="neutral" onPress={() => router.back()} disabled={saving} /><AppButton label={saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'} onPress={() => void handleSave()} disabled={saving} /></View>
  </View></AppScreen>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  sectionTitle: { fontSize: 22 },
  chipWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipTextActive: { color: colors.primary },
  errorText: { color: '#B42318' },
  footerActions: { gap: spacing.sm },
});
