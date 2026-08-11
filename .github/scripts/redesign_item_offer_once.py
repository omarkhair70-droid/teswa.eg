from pathlib import Path
import re

item_path = Path('app/item/[id].tsx')
item = item_path.read_text()


def sub_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, lambda _: replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'missing source block: {label}')
    return updated


item = sub_once(
    item,
    r"  const desireModeLabel = item\?\.desireMode \? \{ specific: 'محدد', flexible: 'مرن', surprise: 'مفاجأة' \}\[item\.desireMode\] : null;\n  const owner = item\?\.ownerPresence;",
    """  const desireModeLabel = item?.desireMode ? { specific: 'محدد', flexible: 'مرن', surprise: 'مفاجأة' }[item.desireMode] : null;
  const owner = item?.ownerPresence;
  const ownedByMe = Boolean(user?.id && owner?.id === user.id);""",
    'owner context',
)

item = sub_once(
    item,
    r"    <AppScreen scrollable backgroundVariant=\"alive\">\n",
    """    <AppScreen scrollable backgroundVariant=\"alive\">
      <View style={styles.detailTopBar}>
        <Pressable accessibilityRole=\"button\" accessibilityLabel=\"رجوع\" style={styles.detailTopIconButton} onPress={() => router.back()}>
          <Ionicons name=\"chevron-forward\" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.detailTopCopy}>
          <AppText muted style={styles.detailEyebrow}>السوق</AppText>
          <AppText weight=\"bold\">تفاصيل العنصر</AppText>
        </View>
        <View style={styles.detailTopActions}>
          <Pressable accessibilityRole=\"button\" accessibilityLabel={item.likedByMe ? 'إلغاء الإعجاب' : 'إعجاب'} disabled={likePending} style={styles.detailActionButton} onPress={onToggleLike}>
            <Ionicons name={item.likedByMe ? 'heart' : 'heart-outline'} size={19} color={item.likedByMe ? colors.primary : colors.text} />
          </Pressable>
          <Pressable accessibilityRole=\"button\" accessibilityLabel=\"خيارات العنصر\" style={styles.detailActionButton} onPress={() => itemActionsSheetRef.current?.present()}>
            <Ionicons name=\"ellipsis-horizontal\" size={19} color={colors.text} />
          </Pressable>
        </View>
      </View>
""",
    'detail top bar',
)

item = sub_once(
    item,
    r"        <AppCard style=\{styles\.premiumCard\}><View style=\{styles\.infoBlock\}><AppText weight=\"bold\" style=\{styles\.title\}>\{item\.title\}</AppText>.*?</View></AppCard>",
    """        <AppCard style={styles.premiumCard}>
          <View style={styles.infoBlock}>
            <View style={styles.titleBlock}>
              <AppText muted style={styles.sectionEyebrow}>متاح للتبادل</AppText>
              <AppText weight=\"bold\" style={styles.title}>{item.title}</AppText>
              {item.description ? <AppText style={styles.descriptionText}>{item.description}</AppText> : null}
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}><Ionicons name=\"heart-outline\" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.likeCount} إعجاب</AppText></View>
              <View style={styles.metaPill}><Ionicons name=\"pricetag-outline\" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.category || 'فئة غير محددة'}</AppText></View>
              <View style={styles.metaPill}><Ionicons name=\"shield-checkmark-outline\" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{item.condition || 'حالة غير محددة'}</AppText></View>
              <View style={styles.metaPill}><Ionicons name=\"location-outline\" size={14} color={colors.primary} /><AppText muted style={styles.metaText}>{locationText}</AppText></View>
            </View>
            {!owner && !!item.ownerDisplayName ? <AppText muted>صاحب العنصر: {item.ownerDisplayName}</AppText> : null}
            {(desireModeLabel || item.desireText || item.wantedTags.length) ? (
              <View style={styles.desireHighlight}>
                <View style={styles.desireIcon}><Ionicons name=\"swap-horizontal\" size={18} color={colors.primary} /></View>
                <View style={styles.desireCopy}>
                  <AppText weight=\"semibold\">إيه اللي ممكن يناسبه؟</AppText>
                  {item.desireText ? <AppText style={styles.desireText}>{item.desireText}</AppText> : desireModeLabel ? <AppText muted>مرونة التبادل: {desireModeLabel}</AppText> : null}
                  {item.wantedTags.length ? <View style={styles.tagsWrap}>{item.wantedTags.slice(0, 4).map((tag) => <View key={tag} style={styles.tagPill}><AppText style={styles.tagText}>{tag}</AppText></View>)}</View> : null}
                </View>
              </View>
            ) : null}
          </View>
        </AppCard>""",
    'primary item info card',
    re.S,
)

story_and_cta_marker = """
      {(item.condition || item.conditionNotes || item.itemStory || item.swapReason || item.goodFor) ? (
        <Animated.View entering={FadeInDown.duration(220).delay(150)}>
          <AppCard style={styles.storyStackCard}>
            <View style={styles.storyStackHeader}>
              <View style={styles.storyStackIcon}><Ionicons name=\"reader-outline\" size={18} color={colors.primary} /></View>
              <View style={styles.storyStackCopy}>
                <AppText weight=\"bold\">عن العنصر</AppText>
                <AppText muted>الحالة والقصة وسبب التبديل في مكان واحد.</AppText>
              </View>
            </View>
            <View style={styles.storySegments}>
              {(item.condition || item.conditionNotes) ? <View style={styles.storySegment}><View style={styles.storySegmentHead}><Ionicons name=\"sparkles-outline\" size={14} color={colors.primary} /><AppText weight=\"semibold\" style={styles.storySegmentLabel}>الحالة</AppText></View><AppText>{item.condition || 'غير محددة'}</AppText>{item.conditionNotes ? <AppText muted>{item.conditionNotes}</AppText> : null}</View> : null}
              {item.itemStory ? <View style={[styles.storySegment, styles.storySegmentDivider]}><View style={styles.storySegmentHead}><Ionicons name=\"book-outline\" size={14} color={colors.primary} /><AppText weight=\"semibold\" style={styles.storySegmentLabel}>القصة</AppText></View><AppText>{item.itemStory}</AppText></View> : null}
              {item.swapReason ? <View style={[styles.storySegment, styles.storySegmentDivider]}><View style={styles.storySegmentHead}><Ionicons name=\"swap-horizontal-outline\" size={14} color={colors.primary} /><AppText weight=\"semibold\" style={styles.storySegmentLabel}>سبب التبديل</AppText></View><AppText>{item.swapReason}</AppText></View> : null}
              {item.goodFor ? <View style={[styles.storySegment, styles.storySegmentDivider]}><View style={styles.storySegmentHead}><Ionicons name=\"people-outline\" size={14} color={colors.primary} /><AppText weight=\"semibold\" style={styles.storySegmentLabel}>مناسب لمين</AppText></View><AppText>{item.goodFor}</AppText></View> : null}
            </View>
          </AppCard>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(220).delay(190)} style={[styles.ctaPanel, ownedByMe && styles.ownerCtaPanel]}>"""

item = sub_once(
    item,
    r"\n      <Animated\.View entering=\{FadeInDown\.duration\(220\)\.delay\(140\)\}>.*?\n\n      <Animated\.View entering=\{FadeInDown\.duration\(220\)\.delay\(190\)\} style=\{styles\.ctaPanel\}>",
    story_and_cta_marker,
    'story card consolidation',
    re.S,
)

item = sub_once(
    item,
    r"<Animated\.View entering=\{FadeInDown\.duration\(220\)\.delay\(190\)\} style=\{\[styles\.ctaPanel, ownedByMe && styles\.ownerCtaPanel\]\}>.*?</Animated\.View>",
    """<Animated.View entering={FadeInDown.duration(220).delay(190)} style={[styles.ctaPanel, ownedByMe && styles.ownerCtaPanel]}>
        <View style={styles.ctaHeader}>
          <View style={styles.ctaIcon}><Ionicons name={ownedByMe ? 'create-outline' : 'swap-horizontal'} size={20} color={colors.primary} /></View>
          <View style={styles.ctaCopy}>
            <AppText weight=\"bold\" style={styles.ctaTitle}>{ownedByMe ? 'ده عنصرك' : 'شايفه مناسب ليك؟'}</AppText>
            <AppText muted style={styles.ctaHint}>{ownedByMe ? 'راجع ظهوره وعدّل التفاصيل في أي وقت.' : (item.desireText ? `صاحبه بيدور على: ${item.desireText}` : 'اختار حاجة من عندك وابعت عرض واضح ومباشر.')}</AppText>
          </View>
        </View>
        {ownedByMe ? <AppButton label=\"تعديل العنصر\" onPress={() => router.push(`/item/edit/${item.id}`)} /> : <AppButton label=\"ابدأ عرض تبديل\" onPress={() => router.push(`/offer/create/${item.id}`)} />}
        <AppButton label=\"خيارات العنصر\" variant=\"neutral\" onPress={() => itemActionsSheetRef.current?.present()} />
        {shareError ? <AppText style={styles.shareErrorText}>{shareError}</AppText> : null}
      </Animated.View>""",
    'contextual item CTA',
    re.S,
)

item = sub_once(
    item,
    r"      <AppActionSheet\n        ref=\{itemActionsSheetRef\}.*?\n      />\n      <View style=\{styles\.captureNode\}",
    """      <AppActionSheet
        ref={itemActionsSheetRef}
        title=\"خيارات العنصر\"
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
      <View style={styles.captureNode}""",
    'item action sheet',
    re.S,
)

item = sub_once(
    item,
    r"const styles = StyleSheet\.create\(\{\n  heroShell:",
    """const styles = StyleSheet.create({
  detailTopBar: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  detailTopIconButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  detailTopCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  detailEyebrow: { fontSize: 10 },
  detailTopActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  detailActionButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heroShell:""",
    'detail styles header',
)

item = sub_once(
    item,
    r"  title: \{ fontSize: 26 \},\n  infoBlock: \{ gap: spacing\.sm \},\n  metaRow:",
    """  title: { fontSize: 28, lineHeight: 35, textAlign: 'right' },
  titleBlock: { gap: 5, alignItems: 'flex-end' },
  descriptionText: { lineHeight: 22, textAlign: 'right' },
  infoBlock: { gap: spacing.md },
  metaRow:""",
    'title styles',
)

item = sub_once(
    item,
    r"  metaText: \{ fontSize: 12 \},\n  ownerCard:",
    """  metaText: { fontSize: 12 },
  desireHighlight: { borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F7E8DD', padding: spacing.sm, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm },
  desireIcon: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  desireCopy: { flex: 1, gap: 5, alignItems: 'flex-end' },
  desireText: { textAlign: 'right', lineHeight: 20 },
  ownerCard:""",
    'desire styles',
)

item = sub_once(
    item,
    r"  storyCard: .*?\n  storyHeader: .*?\n  tagsWrap:",
    """  storyCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
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
  tagsWrap:""",
    'story stack styles',
)

item = sub_once(
    item,
    r"  ctaPanel: \{.*?\},\n  stateBox:",
    """  ctaPanel: { marginTop: spacing.sm, gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F6E4D8' },
  ownerCtaPanel: { borderColor: colors.border, backgroundColor: colors.surface },
  ctaHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  ctaIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  ctaCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  ctaTitle: { fontSize: 18 },
  ctaHint: { textAlign: 'right', lineHeight: 19 },
  stateBox:""",
    'cta styles',
    re.S,
)

item_path.write_text(item)


offer_path = Path('app/offer/create/[itemId].tsx')
offer_path.write_text(r'''import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { createSwapOffer, fetchOfferCreationContext, type OfferCreationContextResult, type OfferItemSummary } from '@/lib/offers';
import { trackEvent } from '@/lib/analytics';

function itemMeta(item: OfferItemSummary) {
  return [item.category, item.condition, item.location].filter(Boolean).join(' • ') || 'بدون تفاصيل إضافية';
}

function RequestedItemCard({ item }: { item: OfferItemSummary }) {
  return (
    <View style={styles.requestedCard}>
      {item.imageUrl ? <ExpoImage source={{ uri: item.imageUrl }} style={styles.requestedImage} contentFit="cover" cachePolicy="memory-disk" transition={120} recyclingKey={item.id} /> : <View style={[styles.requestedImage, styles.thumbPlaceholder]}><Ionicons name="image-outline" size={20} color={colors.textMuted} /></View>}
      <View style={styles.requestedCopy}>
        <View style={styles.eyebrowRow}><Ionicons name="sparkles-outline" size={13} color={colors.primary} /><AppText muted style={styles.eyebrow}>الحاجة اللي عجبتك</AppText></View>
        <AppText weight="bold" style={styles.requestedTitle}>{item.title}</AppText>
        <AppText muted numberOfLines={2} style={styles.metaLine}>{itemMeta(item)}</AppText>
      </View>
    </View>
  );
}

export default function CreateOfferScreen() {
  const { itemId, note } = useLocalSearchParams<{ itemId: string; note?: string | string[] }>();
  const { user } = useAuth();
  const [context, setContext] = useState<OfferCreationContextResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOfferedItemId, setSelectedOfferedItemId] = useState<string | null>(null);
  const initialNote = useMemo(() => {
    if (Array.isArray(note)) return (note[0] ?? '').slice(0, 500);
    return (note ?? '').slice(0, 500);
  }, [note]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    if (!itemId || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOfferCreationContext(itemId, user.id);
      setContext(result);
    } catch (err) {
      if (__DEV__) console.log('[offer-create] load context failed', { itemId, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setError('تعذر تحميل بيانات العرض حالياً. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [itemId, user?.id]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!initialNote) return;
    setMessage((prev) => (prev.trim() ? prev : initialNote));
  }, [initialNote]);

  useEffect(() => {
    if (!user?.id || !itemId) return;
    void trackEvent('offer_started', { route: '/offer/create/[itemId]', entityType: 'item', entityId: itemId });
  }, [itemId, user?.id]);

  const canSubmit = useMemo(() => Boolean(selectedOfferedItemId) && !submitting, [selectedOfferedItemId, submitting]);
  const selectedItem = useMemo(() => context?.ok ? context.myActiveItems.find((item) => item.id === selectedOfferedItemId) ?? null : null, [context, selectedOfferedItemId]);

  const onSubmit = useCallback(async () => {
    if (!itemId || !user?.id || !selectedOfferedItemId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createSwapOffer({ requestedItemId: itemId, offeredItemId: selectedOfferedItemId, message, currentUserId: user.id });
      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }
      void trackEvent('offer_sent', { route: '/offer/create/[itemId]', entityType: 'offer', entityId: result.offerId, metadata: { hasMessage: Boolean(message.trim()) } });
      router.replace(`/offer/${result.offerId}?moment=sent`);
    } catch (err) {
      if (__DEV__) console.log('[offer-create] submit failed', { itemId, offeredItemId: selectedOfferedItemId, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      setSubmitError('تعذر إرسال العرض حالياً. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  }, [itemId, message, selectedOfferedItemId, submitting, user?.id]);

  if (!itemId) return <AppScreen backgroundVariant="soft"><EmptyState title="رابط غير صالح" description="تعذر تحديد العنصر المطلوب." /></AppScreen>;
  if (!user?.id) return <AppScreen backgroundVariant="soft"><EmptyState title="تسجيل الدخول مطلوب" description="لازم تسجل دخولك قبل إرسال عرض تبديل." /></AppScreen>;
  if (loading) return <AppScreen backgroundVariant="soft"><EmptyState title="بنجهز العرض" description="بنجيب حاجتك والعنصر اللي اخترته." /></AppScreen>;
  if (error) return <AppScreen backgroundVariant="soft"><View style={styles.stateBox}><EmptyState title="تعذر تجهيز العرض" description={error} /><AppButton label="إعادة المحاولة" onPress={loadContext} /></View></AppScreen>;
  if (!context) return <AppScreen backgroundVariant="soft"><EmptyState title="تعذر تحميل البيانات" description="حاول مرة أخرى." /></AppScreen>;
  if (!context.ok) return <AppScreen backgroundVariant="soft"><View style={styles.stateBox}><EmptyState title="العرض مش متاح" description={context.message} /><AppButton label="رجوع" variant="neutral" onPress={() => router.back()} /></View></AppScreen>;

  const noOfferableItems = context.myActiveItems.length === 0;

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" style={styles.topIconButton} onPress={() => router.back()}><Ionicons name="chevron-forward" size={20} color={colors.text} /></Pressable>
        <View style={styles.topCopy}><AppText muted style={styles.eyebrow}>عرض تبديل</AppText><AppText weight="bold">اختار اللي هتقدمه</AppText></View>
        <View style={styles.stepPill}><AppText style={styles.stepPillText}>{selectedOfferedItemId ? '2/2' : '1/2'}</AppText></View>
      </View>

      <View style={styles.introBlock}>
        <View style={styles.introIcon}><Ionicons name="swap-horizontal" size={22} color={colors.primary} /></View>
        <View style={styles.introCopy}>
          <AppText weight="bold" style={styles.header}>بدّل حاجة بحاجة</AppText>
          <AppText muted style={styles.introText}>اختار عنصر من عندك، ضيف رسالة لو حابب، وبعدها ابعت العرض لصاحب العنصر.</AppText>
        </View>
      </View>

      <RequestedItemCard item={context.requestedItem} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.stepBadge}><AppText style={styles.stepBadgeText}>1</AppText></View>
          <View style={styles.sectionCopy}><AppText weight="bold">هتقدم إيه؟</AppText><AppText muted>اختار عنصر واحد من حاجتك النشطة.</AppText></View>
        </View>

        {noOfferableItems ? (
          <View style={styles.emptyOfferables}>
            <View style={styles.emptyIcon}><Ionicons name="cube-outline" size={23} color={colors.primary} /></View>
            <View style={styles.emptyCopy}><AppText weight="bold">محتاج تضيف حاجة الأول</AppText><AppText muted>العروض بتتعمل بين عنصرين نشطين، فضيف عنصر من عندك وارجع كمل.</AppText></View>
            <AppButton label="إضافة عنصر" onPress={() => router.push('/(tabs)/add')} />
          </View>
        ) : context.myActiveItems.map((item) => {
          const selected = selectedOfferedItemId === item.id;
          return (
            <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={item.id} style={[styles.selectable, selected && styles.selected]} onPress={() => setSelectedOfferedItemId(item.id)}>
              {item.imageUrl ? <ExpoImage source={{ uri: item.imageUrl }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={120} recyclingKey={item.id} /> : <View style={[styles.thumb, styles.thumbPlaceholder]}><Ionicons name="image-outline" size={18} color={colors.textMuted} /></View>}
              <View style={styles.selectableContent}>
                <AppText weight="semibold" numberOfLines={1}>{item.title}</AppText>
                <AppText muted numberOfLines={1} style={styles.metaLine}>{itemMeta(item)}</AppText>
              </View>
              <View style={[styles.selectionMark, selected && styles.selectionMarkActive]}>{selected ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.messagePanel}>
        <View style={styles.sectionHeader}>
          <View style={styles.stepBadge}><AppText style={styles.stepBadgeText}>2</AppText></View>
          <View style={styles.sectionCopy}><AppText weight="bold">قول كلمة صغيرة</AppText><AppText muted>اختياري، بس بيساعد صاحب العنصر يفهم عرضك أسرع.</AppText></View>
        </View>
        <AppInput value={message} onChangeText={setMessage} placeholder="مثلاً: العنصر حالته ممتازة ومتاح أقابلك في..." multiline numberOfLines={4} maxLength={500} style={styles.messageInput} />
        <AppText muted style={styles.characterCount}>{message.length}/500</AppText>
      </View>

      {selectedItem ? (
        <View style={styles.previewCard}>
          <View style={styles.previewIcon}><Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} /></View>
          <View style={styles.previewCopy}>
            <AppText muted style={styles.eyebrow}>العرض الجاهز</AppText>
            <AppText weight="bold" numberOfLines={2}>{selectedItem.title}  ⇄  {context.requestedItem.title}</AppText>
            <AppText muted>تقدر تغيّر اختيارك قبل الإرسال.</AppText>
          </View>
        </View>
      ) : null}

      {submitError ? <View style={styles.errorBox}><Ionicons name="alert-circle-outline" size={17} color="#B42318" /><AppText style={styles.errorText}>{submitError}</AppText></View> : null}

      <View style={styles.submitPanel}>
        <AppButton label={submitting ? 'جاري إرسال العرض...' : selectedOfferedItemId ? 'إرسال عرض التبديل' : 'اختار حاجة من عندك الأول'} disabled={!canSubmit} onPress={onSubmit} />
        <AppText muted style={styles.submitHint}>الإرسال هنا بيعمل عرض رسمي؛ مفيش قبول تلقائي، والطرف التاني يقدر يقبل أو يرفض.</AppText>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topBar: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  topIconButton: { width: 40, height: 40, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  topCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  stepPill: { minWidth: 42, height: 30, borderRadius: radii.round, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border },
  stepPillText: { color: colors.primary, fontSize: 12 },
  introBlock: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  introIcon: { width: 48, height: 48, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6E4D8', borderWidth: 1, borderColor: '#D9B8A3' },
  introCopy: { flex: 1, gap: 4, alignItems: 'flex-end' },
  introText: { textAlign: 'right', lineHeight: 20 },
  header: { fontSize: 25, lineHeight: 31 },
  eyebrow: { fontSize: 10 },
  eyebrowRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  stateBox: { gap: spacing.md },
  requestedCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F7E8DD', borderRadius: radii.xl, padding: spacing.sm },
  requestedImage: { width: 76, height: 76, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  requestedCopy: { flex: 1, gap: 4, alignItems: 'flex-end' },
  requestedTitle: { fontSize: 19, textAlign: 'right' },
  metaLine: { fontSize: 11, textAlign: 'right' },
  section: { gap: spacing.sm, marginTop: spacing.sm },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  stepBadge: { width: 30, height: 30, borderRadius: radii.round, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: colors.white, fontSize: 12 },
  sectionCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  selectable: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.xl, padding: 9, flexDirection: 'row-reverse', gap: spacing.sm, alignItems: 'center' },
  selected: { borderColor: '#D49A76', backgroundColor: '#F8EADF' },
  selectableContent: { flex: 1, gap: 4, alignItems: 'flex-end' },
  thumb: { width: 62, height: 62, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholder: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  selectionMark: { width: 25, height: 25, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  selectionMarkActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  emptyOfferables: { gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.md, backgroundColor: colors.surface },
  emptyIcon: { width: 44, height: 44, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  emptyCopy: { gap: 4, alignItems: 'flex-end' },
  messagePanel: { gap: spacing.sm, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface, padding: spacing.md },
  messageInput: { minHeight: 100, textAlignVertical: 'top' },
  characterCount: { fontSize: 10, alignSelf: 'flex-start' },
  previewCard: { marginTop: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, borderRadius: radii.xl, borderWidth: 1, borderColor: '#C7DDD7', backgroundColor: colors.accentSoft, padding: spacing.sm },
  previewIcon: { width: 38, height: 38, borderRadius: radii.round, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  previewCopy: { flex: 1, gap: 3, alignItems: 'flex-end' },
  errorBox: { marginTop: spacing.sm, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, borderRadius: radii.lg, borderWidth: 1, borderColor: '#F0C7C1', backgroundColor: '#FFF2F0', padding: spacing.sm },
  errorText: { color: '#B42318', flex: 1, textAlign: 'right' },
  submitPanel: { gap: spacing.xs, marginTop: spacing.md, padding: spacing.md, borderRadius: radii.xl, borderWidth: 1, borderColor: '#D9B8A3', backgroundColor: '#F6E4D8' },
  submitHint: { fontSize: 10, lineHeight: 16, textAlign: 'right' },
});
''')
