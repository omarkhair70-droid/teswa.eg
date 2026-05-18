import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { fetchMyListings, MyListingStatus, MyListingSummary } from '@/lib/my-listings';

const statusLabel: Record<MyListingStatus, string> = {
  active: 'نشط',
  reserved: 'محجوز',
  swapped: 'تم التبديل',
  archived: 'مؤرشف',
};

const statusNote: Record<Exclude<MyListingStatus, 'active'>, string> = {
  reserved: 'هذا العنصر ليس متاحاً للعروض الجديدة حالياً.',
  swapped: 'تم إغلاق هذا العنصر بعد التبديل.',
  archived: 'هذا العنصر مؤرشف وغير ظاهر في السوق.',
};

type FilterKey = 'all' | MyListingStatus;

function buildMetaLine(listing: MyListingSummary): string | null {
  const cityArea = [listing.city, listing.area].filter(Boolean).join(' / ');
  const parts = [listing.category, listing.condition, cityArea].filter(Boolean);
  return parts.length ? parts.join(' • ') : null;
}

export default function ManageMyListingsScreen() {
  const { user } = useAuth();
  const [listings, setListings] = useState<MyListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterKey>('all');

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

  useFocusEffect(
    useCallback(() => {
      void loadListings();
    }, [loadListings]),
  );

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

  const visibleListings = useMemo(
    () => (selectedFilter === 'all' ? listings : listings.filter((item) => item.status === selectedFilter)),
    [listings, selectedFilter],
  );

  if (!user) {
    return <AppScreen><EmptyState title="تسجيل الدخول مطلوب" description="سجّل دخولك أولاً لإدارة عناصرك." /></AppScreen>;
  }

  if (loading) {
    return <AppScreen><AppText muted>جاري تحميل عناصرك...</AppText></AppScreen>;
  }

  if (error) {
    return <AppScreen><AppCard><View style={styles.group}><AppText>{error}</AppText><AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadListings()} /></View></AppCard></AppScreen>;
  }

  if (!listings.length) {
    return (
      <AppScreen>
        <View style={styles.content}>
          <EmptyState title="لا توجد عناصر منشورة بعد" description="ابدأ بنشر أول عنصر لك، وسيظهر هنا لإدارته." />
          <AppButton label="نشر عنصر جديد" onPress={() => router.push('/(tabs)/add')} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppCard>
          <View style={styles.group}>
            <AppText weight="bold" style={styles.headerTitle}>إدارة عناصري</AppText>
            <AppText muted>لديك {listings.length} عنصر في حسابك</AppText>
            <AppButton label="نشر عنصر جديد" variant="neutral" onPress={() => router.push('/(tabs)/add')} />
          </View>
        </AppCard>

        <View style={styles.filtersWrap}>
          {filters.map((filter) => {
            const active = selectedFilter === filter.key;
            return (
              <Pressable key={filter.key} onPress={() => setSelectedFilter(filter.key)} style={[styles.chip, active && styles.chipActive]}>
                <AppText weight={active ? 'semibold' : 'regular'} style={active ? styles.chipTextActive : undefined}>
                  {filter.label} ({filter.count})
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {visibleListings.map((listing) => {
          const metaLine = buildMetaLine(listing);

          return (
            <AppCard key={listing.id}>
              <View style={styles.group}>
                {listing.imageUrl ? (
                  <ExpoImage source={{ uri: listing.imageUrl }} style={styles.previewImage} contentFit="cover" transition={150} cachePolicy="memory-disk" />
                ) : (
                  <View style={styles.placeholder}><AppText muted>لا توجد صورة للعنصر</AppText></View>
                )}

                <View style={styles.titleRow}>
                  <AppText weight="bold" style={styles.itemTitle}>{listing.title}</AppText>
                  <View style={styles.badge}><AppText style={styles.badgeText}>{statusLabel[listing.status]}</AppText></View>
                </View>

                {metaLine ? <AppText muted>{metaLine}</AppText> : null}
                {listing.openIncomingOffersCount > 0 ? <AppText muted>لديه {listing.openIncomingOffersCount} عرض مفتوح</AppText> : null}

                {listing.status === 'active' ? (
                  <View style={styles.actions}>
                    <AppButton label="عرض العنصر" variant="neutral" onPress={() => router.push(`/item/${listing.id}`)} />
                    <AppButton label="تعديل البيانات" variant="neutral" onPress={() => router.push(`/item/edit/${listing.id}`)} />
                  </View>
                ) : listing.status === 'archived' ? (
                  <View style={styles.actions}>
                    <AppText muted>{statusNote[listing.status]}</AppText>
                    <AppButton label="تعديل البيانات" variant="neutral" onPress={() => router.push(`/item/edit/${listing.id}`)} />
                  </View>
                ) : (
                  <AppText muted>{statusNote[listing.status]}</AppText>
                )}
              </View>
            </AppCard>
          );
        })}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  group: { gap: spacing.sm },
  headerTitle: { fontSize: 22 },
  filtersWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipTextActive: { color: colors.primary },
  previewImage: { width: '100%', height: 200, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  placeholder: {
    width: '100%',
    minHeight: 130,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  titleRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1, fontSize: 18 },
  badge: { borderRadius: radii.round, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { color: colors.primary },
  actions: { gap: spacing.xs },
});
