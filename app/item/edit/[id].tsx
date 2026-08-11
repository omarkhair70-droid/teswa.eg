import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { AppButton } from '@/components/ui/AppButton';
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
const desireOptions: { key: DesireMode; label: string; description: string }[] = [
  { key: 'specific', label: 'محدد', description: 'عارف بالضبط إيه اللي يناسبك.' },
  { key: 'flexible', label: 'مرن', description: 'مفتوح لأكثر من اقتراح مناسب.' },
  { key: 'surprise', label: 'مفاجأة', description: 'سيب مساحة لاقتراحات غير متوقعة.' },
];

type SectionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  description: string;
  tone?: 'primary' | 'accent' | 'neutral';
  children: ReactNode;
};

function EditSection({ icon, eyebrow, title, description, tone = 'primary', children }: SectionProps) {
  const palette = tone === 'accent'
    ? { surface: colors.accentSoft, color: colors.accent }
    : tone === 'neutral'
      ? { surface: '#EEE7DF', color: colors.text }
      : { surface: colors.primarySoft, color: colors.primary };
  return (
    <View style={styles.sectionPanel}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: palette.surface }]}><Ionicons name={icon} size={20} color={palette.color} /></View>
        <View style={styles.sectionCopy}>
          <AppText muted style={styles.eyebrow}>{eyebrow}</AppText>
          <AppText weight="bold" style={styles.sectionTitle}>{title}</AppText>
          <AppText muted style={styles.sectionDescription}>{description}</AppText>
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function FieldLabel({ title, hint }: { title: string; hint?: string }) {
  return <View style={styles.fieldLabel}><AppText weight="semibold">{title}</AppText>{hint ? <AppText muted style={styles.fieldHint}>{hint}</AppText> : null}</View>;
}

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

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لتعديل عناصرك." /></AppScreen>;
  if (!itemId) return <AppScreen><EmptyState title="رابط غير صالح" description="تعذر تحديد العنصر المطلوب تعديله." /></AppScreen>;
  if (loading) return <AppScreen><View style={styles.centerState}><View style={styles.loadingIcon}><Ionicons name="create-outline" size={28} color={colors.primary} /></View><AppText weight="bold">بنحمّل بيانات العنصر...</AppText></View></AppScreen>;
  if (loadError) return <AppScreen><View style={styles.centerState}><AppText weight="bold">تعذر فتح التعديل</AppText><AppText muted>{loadError}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadData()} /></View></AppScreen>;
  if (!listing) return <AppScreen><View style={styles.centerState}><EmptyState title="لا يمكن تعديل هذا العنصر" description="قد يكون العنصر غير موجود، أو ليس ملكك، أو غير قابل للتعديل حالياً." /><AppButton label="العودة لإدارة عناصري" onPress={() => router.replace('/item/manage')} /></View></AppScreen>;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.backButton} onPress={() => router.back()} disabled={saving}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText muted style={styles.eyebrow}>إدارة العنصر</AppText>
          <AppText weight="bold" style={styles.title}>عدّل من غير ما تبدأ من الصفر</AppText>
          <AppText muted style={styles.headerDescription}>البيانات هنا بتحدّث العنصر الحالي وتحافظ على تاريخ عرضه وتفاعلاته.</AppText>
        </View>
      </View>

      <View style={styles.itemSummary}>
        <View style={styles.itemSummaryIcon}><Ionicons name="cube-outline" size={22} color={colors.primary} /></View>
        <View style={styles.itemSummaryCopy}>
          <AppText muted style={styles.eyebrow}>العنصر الحالي</AppText>
          <AppText weight="bold" style={styles.itemSummaryTitle} numberOfLines={2}>{listing.title}</AppText>
          <View style={styles.statusLine}>
            <View style={[styles.statusPill, listing.status === 'active' ? styles.activePill : styles.archivedPill]}>
              <AppText style={[styles.statusText, listing.status === 'active' ? styles.activeText : styles.archivedText]}>{listing.status === 'active' ? 'نشط في السوق' : 'مؤرشف'}</AppText>
            </View>
            <AppText muted style={styles.summaryHint}>الصور لها مساحة تعديل منفصلة</AppText>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/item/edit/${listing.id}/images`)} style={styles.imagesShortcut}>
          <Ionicons name="images-outline" size={19} color={colors.accent} />
          <AppText style={styles.imagesShortcutText}>الصور</AppText>
        </Pressable>
      </View>

      {error ? <View style={styles.errorCard}><Ionicons name="alert-circle-outline" size={20} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View> : null}
      {success ? <View style={styles.successCard}><Ionicons name="checkmark-circle-outline" size={21} color={colors.success} /><View style={styles.successCopy}><AppText weight="bold" style={styles.successTitle}>اتحفظت التعديلات</AppText><AppText muted style={styles.successText}>العنصر اتحدّث. تقدر تكمل تعديل الصور أو ترجع لإدارته.</AppText></View></View> : null}

      <EditSection icon="pricetag-outline" eyebrow="الأساس" title="تعريف الحاجة" description="العنوان والتصنيف والمكان بيساعدوا الناس تفهم الحاجة وتلاقيها بسرعة.">
        <FieldLabel title="اسم الحاجة" />
        <AppInput value={title} onChangeText={setTitle} placeholder="مثال: سماعة بلوتوث بحالة ممتازة" editable={!saving} />
        <FieldLabel title="التصنيف" hint={categories.length ? 'اختار أقرب فئة للحاجة.' : 'التصنيفات غير متاحة مؤقتًا.'} />
        <View style={styles.chipWrap}>{categories.map((cat) => <Pressable key={cat.id} style={({ pressed }) => [styles.chip, categoryId === cat.id && styles.chipActive, pressed && styles.pressed]} onPress={() => !saving && setCategoryId(cat.id)} disabled={saving}><AppText style={categoryId === cat.id ? styles.chipTextActive : undefined}>{cat.name_ar}</AppText></Pressable>)}</View>
        <View style={styles.twoColumns}>
          <View style={styles.flexField}><FieldLabel title="المدينة" /><AppInput value={city} onChangeText={setCity} placeholder="المدينة" editable={!saving} /></View>
          <View style={styles.flexField}><FieldLabel title="المنطقة" /><AppInput value={area} onChangeText={setArea} placeholder="المنطقة" editable={!saving} /></View>
        </View>
      </EditSection>

      <EditSection icon="shield-checkmark-outline" eyebrow="الشفافية" title="حالة العنصر" description="خليك دقيق في الحالة والملاحظات؛ ده بيقلل سوء الفهم قبل العرض." tone="accent">
        <View style={styles.choiceList}>
          {conditionOptions.map((option) => {
            const active = condition === option.key;
            return <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{ selected: active }} style={({ pressed }) => [styles.choiceRow, active && styles.choiceRowActive, pressed && styles.pressed]} onPress={() => !saving && setCondition(option.key)} disabled={saving}><View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View><AppText weight={active ? 'semibold' : 'regular'} style={styles.choiceLabel}>{option.label}</AppText>{active ? <Ionicons name="checkmark-circle" size={19} color={colors.primary} /> : null}</Pressable>;
          })}
        </View>
        <FieldLabel title="ملاحظات الحالة" hint="اذكر الخدوش، النقص أو أي حاجة لازم الطرف التاني يعرفها." />
        <AppInput value={conditionNotes} onChangeText={setConditionNotes} placeholder="مثال: خدش بسيط في الجنب فقط" editable={!saving} />
        <FieldLabel title="وصف إضافي" />
        <AppInput value={description} onChangeText={setDescription} placeholder="تفاصيل تساعد اللي قدامك يفهم العنصر" multiline numberOfLines={4} editable={!saving} style={styles.multilineInput} />
      </EditSection>

      <EditSection icon="book-outline" eyebrow="المعنى" title="قصة الحاجة" description="الجزء اللي يخلي العرض إنساني ومفهوم بدل ما يبقى مجرد مواصفات." tone="neutral">
        <FieldLabel title="قصة العنصر" hint={`${itemStory.trim().length}/600`} />
        <AppInput value={itemStory} onChangeText={setItemStory} placeholder="الحاجة دي كانت معاك من إمتى؟ وإيه حكايتها؟" multiline numberOfLines={5} editable={!saving} style={styles.multilineInput} />
        <FieldLabel title="ليه بتبدّلها؟" hint={`${swapReason.trim().length}/240`} />
        <AppInput value={swapReason} onChangeText={setSwapReason} placeholder="سبب التبديل" editable={!saving} />
        <FieldLabel title="مين ممكن تستفيد منها؟" hint={`${goodFor.trim().length}/240`} />
        <AppInput value={goodFor} onChangeText={setGoodFor} placeholder="مثال: مناسبة لطالب أو استخدام يومي" editable={!saving} />
      </EditSection>

      <EditSection icon="swap-horizontal-outline" eyebrow="المقابل" title="إيه اللي ممكن تقبله؟" description="حدد قد إيه أنت مرن، وبعدها وضّح التفاصيل لو عندك تفضيل.">
        <View style={styles.desireGrid}>
          {desireOptions.map((option) => {
            const active = desireMode === option.key;
            return <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => !saving && setDesireMode(option.key)} disabled={saving} style={({ pressed }) => [styles.desireCard, active && styles.desireCardActive, pressed && styles.pressed]}><View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View><AppText weight="bold" style={active ? styles.chipTextActive : undefined}>{option.label}</AppText><AppText muted style={styles.desireDescription}>{option.description}</AppText></Pressable>;
          })}
        </View>
        <FieldLabel title="تفاصيل المقابل" />
        <AppInput value={desireText} onChangeText={setDesireText} placeholder="مثال: مهتم بإلكترونيات أو ألعاب" editable={!saving} />
        <FieldLabel title="كلمات تساعد المطابقة" hint="افصل بين الكلمات بفاصلة." />
        <AppInput value={wantedTagsText} onChangeText={setWantedTagsText} placeholder="لابتوب، سماعات، ألعاب" editable={!saving} />
      </EditSection>

      <View style={styles.savePanel}>
        <View style={styles.saveCopy}><AppText weight="bold" style={styles.saveTitle}>راجع بسرعة وبعدين احفظ</AppText><AppText muted style={styles.saveDescription}>التعديل بيظهر على نفس العنصر؛ مفيش إعلان جديد بيتعمل.</AppText></View>
        <View style={styles.footerActions}><AppButton label="إلغاء" variant="neutral" onPress={() => router.back()} disabled={saving} /><AppButton label={saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'} onPress={() => void handleSave()} disabled={saving} /></View>
        {success ? <View style={styles.afterSaveActions}><AppButton label="إدارة عناصري" variant="neutral" onPress={() => router.replace('/item/manage')} />{listing.status === 'active' ? <AppButton label="عرض العنصر" variant="neutral" onPress={() => router.push(`/item/${listing.id}`)} /> : null}</View> : null}
      </View>
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
  itemSummary: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  itemSummaryIcon: { width: 46, height: 46, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  itemSummaryCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  itemSummaryTitle: { width: '100%', fontSize: 17, textAlign: 'right' },
  statusLine: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  statusPill: { borderRadius: radii.round, paddingHorizontal: 8, paddingVertical: 3 },
  activePill: { backgroundColor: colors.successSoft },
  archivedPill: { backgroundColor: '#EEE7DF' },
  statusText: { fontSize: 10 },
  activeText: { color: colors.success },
  archivedText: { color: colors.textMuted },
  summaryHint: { flex: 1, fontSize: 10, textAlign: 'right' },
  imagesShortcut: { minHeight: 42, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.accentSoft },
  imagesShortcutText: { fontSize: 10, color: colors.accent },
  errorCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, textAlign: 'right' },
  successCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.successSoft },
  successCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  successTitle: { color: colors.success },
  successText: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  sectionPanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.lg },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  sectionIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  sectionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sectionTitle: { fontSize: 18, textAlign: 'right' },
  sectionDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  sectionBody: { gap: spacing.sm },
  fieldLabel: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: 2 },
  fieldHint: { fontSize: 10 },
  chipWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipTextActive: { color: colors.primary },
  twoColumns: { flexDirection: 'row-reverse', gap: spacing.sm },
  flexField: { flex: 1, gap: spacing.xs },
  choiceList: { gap: spacing.xs },
  choiceRow: { minHeight: 50, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  choiceRowActive: { borderColor: colors.primary, backgroundColor: '#FFF8F3' },
  choiceLabel: { flex: 1, textAlign: 'right' },
  radio: { width: 20, height: 20, borderRadius: radii.round, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: radii.round, backgroundColor: colors.primary },
  multilineInput: { minHeight: 104, textAlignVertical: 'top' },
  desireGrid: { flexDirection: 'row-reverse', gap: spacing.sm },
  desireCard: { flex: 1, minHeight: 112, alignItems: 'flex-end', gap: 5, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  desireCardActive: { borderColor: colors.primary, backgroundColor: '#FFF8F3' },
  desireDescription: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
  savePanel: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.primarySoft, gap: spacing.md },
  saveCopy: { alignItems: 'flex-end', gap: 3 },
  saveTitle: { fontSize: 18, textAlign: 'right' },
  saveDescription: { fontSize: 12, lineHeight: 18, textAlign: 'right' },
  footerActions: { gap: spacing.sm },
  afterSaveActions: { gap: spacing.xs },
  pressed: { opacity: 0.72 },
});
