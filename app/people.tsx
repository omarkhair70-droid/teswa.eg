import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchPeopleDirectory, PeopleDirectoryEntry } from '@/lib/people';
import { readAnyPeopleDefaultDirectoryCache, readFreshPeopleDefaultDirectoryCache, writePeopleDefaultDirectoryCache } from '@/lib/offline-people-cache';

export default function PeopleScreen() {
  const [people, setPeople] = useState<PeopleDirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [peopleCacheNotice, setPeopleCacheNotice] = useState<string | null>(null);

  const loadPeople = useCallback(async (nextQuery: string) => {
    const normalizedQuery = nextQuery.trim();

    if (normalizedQuery !== '') {
      setLoading(true);
      setError(false);
      setPeopleCacheNotice(null);

      try {
        const entries = await fetchPeopleDirectory({ query: normalizedQuery });
        setPeople(entries);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(false);
    setPeopleCacheNotice(null);

    const cached = await readFreshPeopleDefaultDirectoryCache();
    const hadFreshCache = Boolean(cached);

    if (cached) {
      setPeople(cached.entries);
      setLoading(false);
      setPeopleCacheNotice('نستعرض ناسًا محفوظين بينما نتحقق من الأحدث.');
    }

    try {
      const entries = await fetchPeopleDirectory({ query: '' });
      setPeople(entries);
      setError(false);
      setPeopleCacheNotice(null);
      await writePeopleDefaultDirectoryCache(entries);
    } catch {
      if (hadFreshCache) {
        setPeopleCacheNotice('تعذر تحديث ناس تِسوى الآن، نعرض آخر نسخة محفوظة.');
        setError(false);
      } else {
        const stale = await readAnyPeopleDefaultDirectoryCache();
        if (stale) {
          setPeople(stale.entries);
          setError(false);
          setPeopleCacheNotice('أنت ترى نسخة محفوظة من ناس تِسوى. سنحدّثها عندما يتحسن الاتصال.');
        } else {
          setError(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeople('');
  }, [loadPeople]);

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    setAppliedQuery(trimmed);
    loadPeople(trimmed);
  }, [loadPeople, query]);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setAppliedQuery('');
    loadPeople('');
  }, [loadPeople]);

  const hasActiveSearch = appliedQuery.length > 0;

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <LinearGradient colors={['#FFF6E8', '#FFE7C8', 'rgba(62,124,115,0.22)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroOrbOne} />
          <View style={styles.heroOrbTwo} />
          <View style={styles.heroIconShell}>
            <Ionicons name="people-outline" size={18} color={colors.primary} />
          </View>
          <AppText weight="bold" style={styles.title}>ناس تِسوى</AppText>
          <AppText>وجوه تعرض، تحكي، وتفتح أبواب تبديل جديدة. ابحث عن شخص أو استكشف الحضور الظاهر الآن.</AppText>
        </LinearGradient>

        <AppCard>
          <View style={styles.searchBox}>
            <AppText style={styles.eyebrow}>ابحث عن حضور</AppText>
            <AppText muted>بالاسم، اليوزرنيم، أو المدينة.</AppText>
            <AppInput value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو اليوزرنيم أو المدينة" />
            <View style={styles.searchActions}>
              <AppButton label="بحث" onPress={handleSearch} disabled={loading} />
              {hasActiveSearch ? <AppButton label="مسح البحث" variant="neutral" onPress={handleClearSearch} disabled={loading} /> : null}
            </View>
          </View>
        </AppCard>

        {!loading && !error ? (
          <AppCard>
            <View style={styles.summaryRow}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
              <AppText>
                {hasActiveSearch
                  ? `وجدنا ${people.length} ملفًا قريبًا من بحثك`
                  : `نستعرض ${people.length} من ناس تِسوى الآن`}
              </AppText>
            </View>
          </AppCard>
        ) : null}

        {peopleCacheNotice ? (
          <AppCard>
            <View style={styles.noticeRow}>
              <Ionicons name="layers-outline" size={16} color={colors.primary} />
              <AppText muted style={styles.noticeText}>{peopleCacheNotice}</AppText>
            </View>
          </AppCard>
        ) : null}
      </View>
    ),
    [error, handleClearSearch, handleSearch, hasActiveSearch, loading, people.length, peopleCacheNotice, query],
  );

  const renderPerson = useCallback(({ item }: { item: PeopleDirectoryEntry }) => {
    const location = [item.city, item.area].filter(Boolean).join(' • ');
    const identityText = item.profileTagline || item.bio;
    const firstChar = (item.displayName || item.username || 'م').trim().charAt(0).toUpperCase();

    return (
      <Pressable onPress={() => router.push(`/profile/${item.id}`)}>
        <AppCard>
          <View style={styles.personCard}>
            <View style={styles.coverWrap}>
              {item.coverUrl ? (
                <ExpoImage source={{ uri: item.coverUrl }} style={styles.coverImage} contentFit="cover" />
              ) : (
                <LinearGradient colors={['#FFEBD2', '#F7D7B4', 'rgba(62,124,115,0.32)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.coverFallback} />
              )}
            </View>

            <View style={styles.identityRow}>
              {item.avatarUrl ? (
                <ExpoImage source={{ uri: item.avatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarFallbackText}>{firstChar}</AppText></View>
              )}

              <View style={styles.identityBox}>
                <AppText weight="bold" style={styles.displayName}>{item.displayName}</AppText>
                <AppText muted>@{item.username}</AppText>
                {location ? (
                  <View style={styles.locationPill}>
                    <Ionicons name="location-outline" size={13} color={colors.primary} />
                    <AppText muted style={styles.locationText}>{location}</AppText>
                  </View>
                ) : null}
              </View>
            </View>

            {identityText ? <AppText muted numberOfLines={2}>{identityText}</AppText> : null}

            <View style={styles.signalRow}>
              <View style={styles.signalPill}>
                <Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} />
                <AppText muted>{item.successfulSwapsCount} مقايضات</AppText>
              </View>
              <View style={styles.signalPill}>
                <Ionicons name="cube-outline" size={14} color={colors.primary} />
                <AppText muted>{item.activeItemsCount} عناصر نشطة</AppText>
              </View>
              {item.responseRate !== null ? (
                <View style={styles.signalPill}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.primary} />
                  <AppText muted>رد {item.responseRate}%</AppText>
                </View>
              ) : null}
            </View>

            <View style={styles.openCue}>
              <AppText muted>افتح الملف</AppText>
              <Ionicons name="chevron-back-outline" size={14} color={colors.primary} />
            </View>
          </View>
        </AppCard>
      </Pressable>
    );
  }, []);

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        renderItem={renderPerson}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري تجهيز الوجوه" description="نحضّر لك ناس تِسوى الآن." />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState title="تعذر تحميل ناس تِسوى" description="الاتصال مش مستقر الآن. جرّب مرة أخرى بعد قليل." />
              <AppButton label="إعادة المحاولة" onPress={() => loadPeople(appliedQuery)} />
            </View>
          ) : hasActiveSearch ? (
            <View style={styles.stateBox}>
              <EmptyState title="ملقيناش نتائج مطابقة" description="جرّب اسمًا آخر، يوزرنيم مختلف، أو مدينة ثانية." />
              <AppButton label="مسح البحث" variant="neutral" onPress={handleClearSearch} />
            </View>
          ) : (
            <View style={styles.stateBox}>
              <EmptyState title="لسه ناس تِسوى بيظهروا هنا" description="مع كل ملف جديد، هتلاقي وجوه وحكايات أكثر جاهزية للتبديل." />
              <AppButton label="اعرض حاجة" onPress={() => router.push('/(tabs)/add')} />
            </View>
          )
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  heroCard: { borderRadius: radii.lg, padding: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', gap: spacing.sm },
  heroOrbOne: {
    position: 'absolute', width: 136, height: 136, borderRadius: radii.round, backgroundColor: 'rgba(255, 220, 170, 0.32)', top: -34, left: -24,
  },
  heroOrbTwo: {
    position: 'absolute', width: 130, height: 130, borderRadius: radii.round, backgroundColor: 'rgba(62,124,115,0.14)', bottom: -56, right: -10,
  },
  heroIconShell: {
    width: 34, height: 34, borderRadius: radii.round, backgroundColor: 'rgba(255,255,255,0.66)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(62,124,115,0.2)',
  },
  title: { fontSize: 24 },
  searchBox: { gap: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 12 },
  searchActions: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  noticeText: { flex: 1 },
  personCard: { gap: spacing.sm },
  coverWrap: { borderRadius: radii.md, overflow: 'hidden', height: 86 },
  coverImage: { width: '100%', height: '100%' },
  coverFallback: { width: '100%', height: '100%' },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: -24 },
  avatar: { width: 68, height: 68, borderRadius: radii.round, borderWidth: 2, borderColor: '#fff', backgroundColor: colors.primarySoft },
  avatarFallback: {
    width: 68, height: 68, borderRadius: radii.round, borderWidth: 2, borderColor: '#fff', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  avatarFallbackText: { color: colors.primary },
  identityBox: { flex: 1, gap: spacing.xs, paddingTop: spacing.sm },
  displayName: { fontSize: 17 },
  locationPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: spacing.xs, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: 'rgba(62,124,115,0.08)' },
  locationText: { fontSize: 12 },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  signalPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.xs, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: 'rgba(255, 164, 59, 0.12)' },
  openCue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  stateBox: { gap: spacing.md },
});
