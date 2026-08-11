import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { archiveListingFromMobile, deleteArchivedListingFromMobile, reactivateListingFromMobile } from '@/lib/listing-lifecycle';
import { fetchMyListings, MyListingStatus, MyListingSummary } from '@/lib/my-listings';

const statusLabel: Record<MyListingStatus, string> = {
  active: 'نشط',
  reserved: 'محجوز',
  swapped: 'تم التبديل',
  archived: 'مؤرشف',
};

const statusTone: Record<MyListingStatus, { surface: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  active: { surface: colors.successSoft, color: colors.success, icon: 'checkmark-circle-outline' },
  reserved: { surface: colors.accentSoft, color: colors.accent, icon: 'hourglass-outline' },
  swapped: { surface: colors.primarySoft, color: colors.primary, icon: 'swap-horizontal-outline' },
  archived: { surface: '#EEE7DF', color: colors.textMuted, icon: 'archive-outline' },
};

const statusNote: Record<Exclude<MyListingStatus, 'active'>, string> = {
  reserved: 'العنصر مرتبط بتبديل أو عرض حالي ومش متاح لعروض جديدة.',
  swapped: 'العنصر اتقفل بعد اكتمال التبديل.',
  archived: 'العنصر مش ظاهر في السوق ويمكنك تعديله أو إرجاعه للنشر.',
};

type FilterKey = 'all' | MyListingStatus;
type MiniActionProps = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; disabled?: boolean };

function buildMetaLine(listing: MyListingSummary): string | null {
  const cityArea = [listing.city, listing.area].filter(Boolean).join(' / ');
  const parts = [listing.category, listing.condition, cityArea].filter(Boolean);
  return parts.length ? parts.join(' • ') : null;
}

function MiniAction({ icon, label, onPress, danger = false, disabled = false }: MiniActionProps) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.miniAction, danger && styles.miniActionDanger, disabled && styles.disabled, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={danger ? colors.danger : colors.text} />
      <AppText style={[styles.miniActionText, danger && styles.dangerText]}>{label}</AppText>
    </Pressable>
  );
}

export default function ManageMyListingsScreen() {
  const { user } = useAuth();
  const [listings, setListings] = useState<MyListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('all');
  const [lifecycleBusyById, setLifecycleBusyById] = useState<Record<string, 'archive' | 'reactivate' | 'delete' | undefined>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    if (!user?.id) {
      setListings([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyListings(user.id);
      setListings(data);
    } catch (loadError) {
      if (__DEV__) console.log('[my-listings] load failed', loadError);
      setError('تعذر تحميل عناصرك حالياً. حاول مرة أخرى.');
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void loadListings(); }, [loadListings]));

  const counts = useMemo(() => ({
    all: listings.length,
    active: listings.filter((item) => item.status === 'active').length,
    reserved: listings.filter((item) => item.status === 'reserved').length,
    swapped: listings.filter((item) => item.status === 'swapped').length,
    archived: listings.filter((item) => item.status === 'archived').length,
  }), [listings]);

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: counts.all },
    { key: 'active', label: 'نشطة', count: counts.active },
    { key: 'reserved', label: 'محجوزة', count: counts.reserved },
    { key: 'swapped', label: 'تم تبديلها', count: counts.swapped },
    { key: 'archived', label: 'مؤرشفة', count: counts.archived },
  ];

  const visibleListings = useMemo(() => selectedFilter === 'all' ? listings : listings.filter((item) => item.status === selectedFilter), [listings, selectedFilter]);

  const runLifecycleAction = useCallback(async (itemId: string, action: 'archive' | 'reactivate' | 'delete') => {
    setLifecycleBusyById((prev) => ({ ...prev, [itemId]: action }));
    try {
      const result = action === 'archive'
        ? await archiveListingFromMobile({ itemId })
        : action === 'reactivate'
          ? await reactivateListingFromMobile({ itemId })
          : await deleteArchivedListingFromMobile({ itemId });
      setFeedback(result.message);
      if (result.ok) await loadListings();
    } finally {
      setLifecycleBusyById((prev) => ({ ...prev, [itemId]: undefined }));
    }
  }, [loadListings]);

  if (!user) return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإدارة عناصرك." /></AppScreen>;
  if (loading) return <AppScreen><View style={styles.centerState}><View style={styles.loadingIcon}><Ionicons name="cube-outline" size={28} color={colors.primary} /></View><AppText weight="bold">بنجهّز عناصرك...</AppText><AppText muted>بنحمّل حالات العناصر والعروض المرتبطة بيها.</AppText></View></AppScreen>;

  if (error) {
    return <AppScreen><View style={styles.centerState}><View style={[styles.loadingIcon, styles.errorIcon]}><Ionicons name="cloud-offline-outline" size={28} color={colors.danger} /></View><AppText weight="bold">تعذر تحميل عناصرك</AppText><AppText muted>{error}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadListings()} /></View></AppScreen>;
  }

  if (!listings.length) {
    return (
      <AppScreen backgroundVariant="alive">
        <View style={styles.centerState}>
          <View style={styles.emptyHeroIcon}><Ionicons name="add-circle-outline" size={34} color={colors.primary} /></View>
          <AppText weight="bold" style={styles.emptyTitle}>دولاب التبديل لسه فاضي</AppText>
          <AppText muted style={styles.emptyDescription}>انشر أول حاجة عندك، وبعدها هتدير حالتها وصورها وعروضها من هنا.</AppText>
          <AppButton label="نشر عنصر جديد" onPress={() => router.push('/(tabs)/add')} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="cube-outline" size={23} color={colors.primary} /></View>
        <View style={styles.heroCopy}>
          <AppText muted style={styles.eyebrow}>مساحة إدارة حاجاتك</AppText>
          <AppText weight="bold" style={styles.title}>عناصري</AppText>
          <AppText muted style={styles.heroDescription}>عدّل، أرشف، رجّع للنشر، أو تابع العناصر اللي دخلت في تبديل.</AppText>
        </View>
      </View>

      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{counts.active}</AppText><AppText muted style={styles.summaryLabel}>نشط</AppText></View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{counts.reserved}</AppText><AppText muted style={styles.summaryLabel}>محجوز</AppText></View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}><AppText weight="bold" style={styles.summaryValue}>{counts.swapped}</AppText><AppText muted style={styles.summaryLabel}>تم تبديله</AppText></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/add')} style={styles.addButton}><Ionicons name="add" size={20} color={colors.white} /><AppText weight="semibold" style={styles.addButtonText}>عنصر</AppText></Pressable>
      </View>

      {feedback ? <View style={styles.feedback}><Ionicons name="checkmark-circle-outline" size={20} color={colors.success} /><AppText style={styles.feedbackText}>{feedback}</AppText></View> : null}

      <View style={styles.filtersWrap}>
        {filters.map((filter) => {
          const active = selectedFilter === filter.key;
          return (
            <Pressable key={filter.key} onPress={() => setSelectedFilter(filter.key)} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}>
              <AppText weight={active ? 'semibold' : 'regular'} style={active ? styles.chipTextActive : undefined}>{filter.label}</AppText>
              <View style={[styles.countPill, active && styles.countPillActive]}><AppText style={[styles.countText, active && styles.countTextActive]}>{filter.count}</AppText></View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.listPanel}>
        <View style={styles.listHeader}>
          <View style={styles.listHeaderIcon}><Ionicons name="list-outline" size={18} color={colors.primary} /></View>
          <View style={styles.listHeaderCopy}><AppText muted style={styles.eyebrow}>العرض الحالي</AppText><AppText weight="bold" style={styles.listTitle}>{visibleListings.length} عنصر</AppText></View>
        </View>

        {visibleListings.length === 0 ? (
          <View style={styles.noResults}><Ionicons name="filter-outline" size={24} color={colors.textMuted} /><AppText weight="semibold">مفيش عناصر في الحالة دي</AppText><AppText muted>غيّر الفلتر عشان تشوف باقي عناصرك.</AppText></View>
        ) : visibleListings.map((listing, index) => {
          const metaLine = buildMetaLine(listing);
          const busyAction = lifecycleBusyById[listing.id];
          const tone = statusTone[listing.status];

          return (
            <View key={listing.id} style={[styles.listingRow, index === visibleListings.length - 1 && styles.listingRowLast]}>
              {listing.imageUrl ? <ExpoImage source={{ uri: listing.imageUrl }} style={styles.previewImage} contentFit="cover" transition={150} cachePolicy="memory-disk" /> : <View style={styles.placeholder}><Ionicons name="image-outline" size={24} color={colors.textMuted} /></View>}

              <View style={styles.listingMain}>
                <View style={styles.titleRow}>
                  <AppText weight="bold" style={styles.itemTitle} numberOfLines={2}>{listing.title}</AppText>
                  <View style={[styles.badge, { backgroundColor: tone.surface }]}><Ionicons name={tone.icon} size={13} color={tone.color} /><AppText style={[styles.badgeText, { color: tone.color }]}>{statusLabel[listing.status]}</AppText></View>
                </View>
                {metaLine ? <AppText muted style={styles.meta} numberOfLines={1}>{metaLine}</AppText> : null}
                {listing.openIncomingOffersCount > 0 ? <View style={styles.offerSignal}><Ionicons name="swap-horizontal-outline" size={14} color={colors.accent} /><AppText style={styles.offerSignalText}>{listing.openIncomingOffersCount} عرض مفتوح</AppText></View> : null}
                {listing.status !== 'active' ? <AppText muted style={styles.statusNote}>{statusNote[listing.status]}</AppText> : null}

                <View style={styles.actionsRow}>
                  {listing.status === 'active' ? <MiniAction icon="eye-outline" label="عرض" onPress={() => router.push(`/item/${listing.id}`)} /> : null}
                  {(listing.status === 'active' || listing.status === 'archived') ? <MiniAction icon="create-outline" label="البيانات" onPress={() => router.push(`/item/edit/${listing.id}`)} /> : null}
                  {(listing.status === 'active' || listing.status === 'archived') ? <MiniAction icon="images-outline" label="الصور" onPress={() => router.push(`/item/edit/${listing.id}/images`)} /> : null}
                  {listing.status === 'active' ? <MiniAction icon="archive-outline" label={busyAction === 'archive' ? 'بأرشف...' : 'أرشفة'} disabled={Boolean(busyAction)} onPress={() => void runLifecycleAction(listing.id, 'archive')} /> : null}
                  {listing.status === 'archived' ? <MiniAction icon="refresh-outline" label={busyAction === 'reactivate' ? 'برجّع...' : 'إعادة نشر'} disabled={Boolean(busyAction)} onPress={() => void runLifecycleAction(listing.id, 'reactivate')} /> : null}
                  {listing.status === 'archived' ? <MiniAction icon="trash-outline" label={busyAction === 'delete' ? 'بحذف...' : 'حذف'} danger disabled={Boolean(busyAction)} onPress={() => {
                    Alert.alert('حذف العنصر', 'سيتم حذف هذا العنصر نهائيًا من حسابك إذا لم يكن مرتبطًا بعروض مفتوحة أو تاريخ صفقات. هل تريد المتابعة؟', [
                      { text: 'إلغاء', style: 'cancel' },
                      { text: 'حذف', style: 'destructive', onPress: () => { void runLifecycleAction(listing.id, 'delete'); } },
                    ]);
                  }} /> : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  loadingIcon: { width: 58, height: 58, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  errorIcon: { backgroundColor: colors.dangerSoft },
  emptyHeroIcon: { width: 72, height: 72, borderRadius: radii.round, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, textAlign: 'center' },
  emptyDescription: { textAlign: 'center', lineHeight: 21 },
  hero: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  heroIcon: { width: 48, height: 48, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 29, lineHeight: 36 },
  heroDescription: { textAlign: 'right', lineHeight: 21 },
  summaryStrip: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryItem: { minWidth: 54, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 18 },
  summaryLabel: { fontSize: 10 },
  summaryDivider: { width: 1, height: 34, backgroundColor: colors.border },
  addButton: { marginRight: 'auto', minHeight: 42, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.primary },
  addButtonText: { color: colors.white },
  feedback: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.successSoft },
  feedbackText: { flex: 1, color: colors.success, textAlign: 'right' },
  filtersWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipTextActive: { color: colors.primary },
  countPill: { minWidth: 20, height: 20, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  countPillActive: { backgroundColor: colors.surface },
  countText: { fontSize: 10, color: colors.textMuted },
  countTextActive: { color: colors.primary },
  listPanel: { borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  listHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  listHeaderIcon: { width: 38, height: 38, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  listHeaderCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  listTitle: { fontSize: 17 },
  noResults: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  listingRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  listingRowLast: { borderBottomWidth: 0 },
  previewImage: { width: 96, height: 108, borderRadius: radii.lg, backgroundColor: colors.primarySoft },
  placeholder: { width: 96, height: 108, borderRadius: radii.lg, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  listingMain: { flex: 1, alignItems: 'flex-end', gap: 5 },
  titleRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  itemTitle: { flex: 1, fontSize: 16, textAlign: 'right' },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: radii.round, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10 },
  meta: { width: '100%', fontSize: 11, textAlign: 'right' },
  offerSignal: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  offerSignalText: { fontSize: 11, color: colors.accent },
  statusNote: { width: '100%', fontSize: 11, lineHeight: 17, textAlign: 'right' },
  actionsRow: { width: '100%', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  miniAction: { minHeight: 34, flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderRadius: radii.round, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  miniActionDanger: { backgroundColor: colors.dangerSoft, borderColor: '#F2C7C3' },
  miniActionText: { fontSize: 10 },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
