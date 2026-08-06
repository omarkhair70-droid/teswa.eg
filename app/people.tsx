import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
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
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { fetchPeopleDirectory, PEOPLE_DIRECTORY_PAGE_SIZE, PeopleDirectoryEntry } from '@/lib/people';
import { readAnyPeopleDefaultDirectoryCache, readFreshPeopleDefaultDirectoryCache, writePeopleDefaultDirectoryCache } from '@/lib/offline-people-cache';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

const PEOPLE_SKELETONS = ['people-skeleton-1', 'people-skeleton-2', 'people-skeleton-3'];

function PeopleLoadingState() {
  return (
    <View style={styles.loadingList} accessibilityLabel="جاري تحميل ناس تسوى">
      {PEOPLE_SKELETONS.map((key) => (
        <AppCard key={key} padding="md" style={styles.skeletonCard}>
          <View style={styles.skeletonCover} />
          <View style={styles.skeletonIdentityRow}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonCopy}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonLineSmall} />
            </View>
          </View>
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonStats} />
        </AppCard>
      ))}
    </View>
  );
}

export default function PeopleScreen() {
  const [people, setPeople] = useState<PeopleDirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(false);
  const [peopleCacheNotice, setPeopleCacheNotice] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);
  const firstPageInFlightRef = useRef(false);
  const loadMoreRequestRef = useRef<symbol | null>(null);

  const loadFirstPage = useCallback(async (nextQuery: string, mode: 'initial' | 'refresh') => {
    const normalizedQuery = nextQuery.trim();
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    firstPageInFlightRef.current = true;
    loadMoreRequestRef.current = null;

    setPeople([]);
    setPage(0);
    setHasMore(true);
    setError(false);
    setLoadMoreError(false);
    setLoadingMore(false);
    setPeopleCacheNotice(null);
    setInitialLoading(mode === 'initial');
    setRefreshing(mode === 'refresh');

    let cachedFirstPage: PeopleDirectoryEntry[] | null = null;

    if (normalizedQuery === '' && mode === 'initial') {
      const cached = await readFreshPeopleDefaultDirectoryCache();
      if (generation !== requestGenerationRef.current) {
        return;
      }

      if (cached) {
        cachedFirstPage = cached.entries.slice(0, PEOPLE_DIRECTORY_PAGE_SIZE);
        setPeople(cachedFirstPage);
        setPage(1);
        setHasMore(cachedFirstPage.length === PEOPLE_DIRECTORY_PAGE_SIZE);
        setPeopleCacheNotice('نستعرض ناسًا محفوظين بينما نتحقق من الأحدث.');
      }
    }

    try {
      const result = await fetchPeopleDirectory({
        query: normalizedQuery,
        page: 1,
        pageSize: PEOPLE_DIRECTORY_PAGE_SIZE,
      });
      if (generation !== requestGenerationRef.current) {
        return;
      }

      setPeople(result.entries);
      setPage(1);
      setHasMore(result.hasMore);
      setError(false);
      setPeopleCacheNotice(null);

      if (normalizedQuery === '') {
        void writePeopleDefaultDirectoryCache(result.entries);
      }
    } catch {
      if (generation !== requestGenerationRef.current) {
        return;
      }

      if (cachedFirstPage) {
        setPeopleCacheNotice('تعذر تحديث ناس تِسوى الآن، نعرض آخر نسخة محفوظة.');
        setError(false);
      } else if (normalizedQuery === '') {
        const stale = await readAnyPeopleDefaultDirectoryCache();
        if (generation !== requestGenerationRef.current) {
          return;
        }

        if (stale) {
          const staleFirstPage = stale.entries.slice(0, PEOPLE_DIRECTORY_PAGE_SIZE);
          setPeople(staleFirstPage);
          setPage(1);
          setHasMore(staleFirstPage.length === PEOPLE_DIRECTORY_PAGE_SIZE);
          setError(false);
          setPeopleCacheNotice('أنت ترى نسخة محفوظة من ناس تِسوى. سنحدّثها عندما يتحسن الاتصال.');
        } else {
          setError(true);
          setHasMore(false);
        }
      } else {
        setError(true);
        setHasMore(false);
      }
    } finally {
      if (generation === requestGenerationRef.current) {
        firstPageInFlightRef.current = false;
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadMorePeople = useCallback(async (allowRetry = false) => {
    if (
      loadMoreRequestRef.current
      || firstPageInFlightRef.current
      || initialLoading
      || refreshing
      || error
      || !hasMore
      || page < 1
      || (loadMoreError && !allowRetry)
    ) {
      return;
    }

    const generation = requestGenerationRef.current;
    const requestToken = Symbol('people-load-more');
    const nextPage = page + 1;
    loadMoreRequestRef.current = requestToken;
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const result = await fetchPeopleDirectory({
        query: appliedQuery,
        page: nextPage,
        pageSize: PEOPLE_DIRECTORY_PAGE_SIZE,
      });
      if (
        generation !== requestGenerationRef.current
        || loadMoreRequestRef.current !== requestToken
      ) {
        return;
      }

      setPeople((currentPeople) => {
        const peopleById = new Map(currentPeople.map((person) => [person.id, person]));
        for (const person of result.entries) {
          peopleById.set(person.id, person);
        }
        return Array.from(peopleById.values());
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch {
      if (
        generation === requestGenerationRef.current
        && loadMoreRequestRef.current === requestToken
      ) {
        setLoadMoreError(true);
      }
    } finally {
      if (loadMoreRequestRef.current === requestToken) {
        loadMoreRequestRef.current = null;
        if (generation === requestGenerationRef.current) {
          setLoadingMore(false);
        }
      }
    }
  }, [appliedQuery, error, hasMore, initialLoading, loadMoreError, page, refreshing]);

  useEffect(() => {
    const initialLoadTimer = setTimeout(() => {
      void loadFirstPage('', 'initial');
    }, 0);

    return () => clearTimeout(initialLoadTimer);
  }, [loadFirstPage]);

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    setAppliedQuery(trimmed);
    void loadFirstPage(trimmed, 'initial');
  }, [loadFirstPage, query]);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setAppliedQuery('');
    void loadFirstPage('', 'initial');
  }, [loadFirstPage]);

  const handleRefresh = useCallback(() => {
    void loadFirstPage(appliedQuery, 'refresh');
  }, [appliedQuery, loadFirstPage]);

  const hasActiveSearch = appliedQuery.length > 0;
  const hasPeople = people.length > 0;
  const firstPageLoading = initialLoading || refreshing;

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <LinearGradient
          colors={['#FFF9F1', '#F7E2D4', '#DDEBE7']}
          locations={[0, 0.58, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroOrbPrimary} />
          <View style={styles.heroOrbAccent} />
          <View style={styles.heroBadge}>
            <Ionicons name="people-outline" size={15} color={colors.primary} />
            <AppText weight="semibold" style={styles.heroBadgeText}>مجتمع تِسوى</AppText>
          </View>
          <AppText weight="bold" style={styles.title}>ناس عندها حاجات وحكايات</AppText>
          <AppText muted style={styles.heroDescription}>
            اكتشف ناسًا قريبين من اهتماماتك، وشوف عالم كل شخص قبل ما تبدأ التبديل.
          </AppText>
          <View style={styles.heroSignalRow}>
            <View style={styles.heroSignalDot} />
            <AppText style={styles.heroSignalText}>ملفات حقيقية من مجتمع تِسوى</AppText>
          </View>
        </LinearGradient>

        <AppCard style={styles.searchCard}>
          <View style={styles.searchTitleRow}>
            <View style={styles.searchIconShell}>
              <Ionicons name="search-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.searchTitleCopy}>
              <AppText weight="bold" style={styles.searchTitle}>دور على شخص</AppText>
              <AppText muted style={styles.searchHint}>بالاسم، اليوزرنيم، المدينة أو المنطقة</AppText>
            </View>
          </View>

          <AppInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            placeholder="مثال: عمر، @username، القاهرة"
            accessibilityLabel="ابحث عن شخص في تسوى"
          />

          <View style={styles.searchActions}>
            <View style={styles.searchPrimaryAction}>
              <AppButton label="ابحث" iconName="search-outline" onPress={handleSearch} disabled={firstPageLoading} fullWidth />
            </View>
            {hasActiveSearch ? (
              <AppButton label="مسح" variant="neutral" iconName="close-outline" onPress={handleClearSearch} disabled={firstPageLoading} />
            ) : null}
          </View>

          {!firstPageLoading && !error ? (
            <View style={styles.resultsSummary}>
              <View style={styles.resultsSummaryIcon}>
                <Ionicons name={hasActiveSearch ? 'search-outline' : 'sparkles-outline'} size={14} color={colors.accent} />
              </View>
              <AppText muted style={styles.resultsSummaryText}>
                {hasActiveSearch
                  ? people.length > 0
                    ? `${people.length} نتيجة لـ «${appliedQuery}»`
                    : `لا توجد نتائج لـ «${appliedQuery}»`
                  : `${people.length} ملفًا متاحًا للاستكشاف الآن`}
              </AppText>
            </View>
          ) : null}
        </AppCard>

        {peopleCacheNotice ? (
          <AppCard variant="outlined" padding="md" style={styles.noticeCard}>
            <View style={styles.noticeIconShell}>
              <Ionicons name="cloud-offline-outline" size={17} color={colors.accent} />
            </View>
            <AppText muted style={styles.noticeText}>{peopleCacheNotice}</AppText>
          </AppCard>
        ) : null}

        {hasPeople ? (
          <View style={styles.sectionHeading}>
            <View>
              <AppText weight="bold" style={styles.sectionTitle}>{hasActiveSearch ? 'نتائج البحث' : 'اكتشف ناس تِسوى'}</AppText>
              <AppText muted style={styles.sectionSubtitle}>{hasActiveSearch ? 'ملفات قريبة من بحثك' : 'افتح أي ملف واعرف صاحبه أكثر'}</AppText>
            </View>
            <View style={styles.countPill}>
              <AppText weight="bold" style={styles.countPillText}>{people.length}</AppText>
            </View>
          </View>
        ) : null}
      </View>
    ),
    [appliedQuery, error, firstPageLoading, handleClearSearch, handleSearch, hasActiveSearch, hasPeople, people.length, peopleCacheNotice, query],
  );

  const renderPerson = useCallback(({ item, index }: { item: PeopleDirectoryEntry; index: number }) => {
    const location = [item.city, item.area].filter(Boolean).join(' • ');
    const identityText = item.profileTagline || item.bio;
    const firstChar = (item.displayName || item.username || 'م').trim().charAt(0).toUpperCase();

    return (
      <AppFadeIn delay={Math.min(index * 35, 180)} fromY={10}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`فتح ملف ${item.displayName}`}
          onPress={() => router.push(`/profile/${item.id}`)}
          style={({ pressed }) => [styles.personPressable, pressed && styles.personPressed]}
        >
          <AppCard padding="md" style={styles.personCard}>
            <View style={styles.coverWrap}>
              {item.coverUrl ? (
                <ExpoImage
                  source={{ uri: item.coverUrl }}
                  style={styles.coverImage}
                  contentFit="cover"
                  transition={180}
                  cachePolicy="memory-disk"
                />
              ) : (
                <LinearGradient
                  colors={[colors.primarySoft, '#F6CFAF', colors.accentSoft]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.coverFallback}
                >
                  <View style={styles.coverFallbackOrbOne} />
                  <View style={styles.coverFallbackOrbTwo} />
                </LinearGradient>
              )}
              <LinearGradient
                colors={['rgba(29,26,22,0.02)', 'rgba(29,26,22,0.35)']}
                style={StyleSheet.absoluteFill}
              />
              {location ? (
                <View style={styles.coverLocationPill}>
                  <Ionicons name="location-outline" size={12} color={colors.white} />
                  <AppText numberOfLines={1} style={styles.coverLocationText}>{location}</AppText>
                </View>
              ) : null}
            </View>

            <View style={styles.identityRow}>
              <View style={styles.avatarAura}>
                {item.avatarUrl ? (
                  <ExpoImage
                    source={{ uri: item.avatarUrl }}
                    style={styles.avatar}
                    contentFit="cover"
                    transition={180}
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <LinearGradient colors={[colors.primarySoft, '#FFF4DC']} style={[styles.avatar, styles.avatarFallback]}>
                    <AppText weight="bold" style={styles.avatarFallbackText}>{firstChar}</AppText>
                  </LinearGradient>
                )}
              </View>

              <View style={styles.identityBox}>
                <AppText weight="bold" numberOfLines={1} style={styles.displayName}>{item.displayName}</AppText>
                <AppText muted numberOfLines={1} style={styles.username}>@{item.username}</AppText>
              </View>

              <View style={styles.openIconShell}>
                <Ionicons name="chevron-back-outline" size={17} color={colors.primary} />
              </View>
            </View>

            {identityText ? <AppText muted numberOfLines={2} style={styles.identityText}>{identityText}</AppText> : null}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <View style={[styles.statIconShell, styles.statIconPrimary]}>
                  <Ionicons name="swap-horizontal-outline" size={14} color={colors.primary} />
                </View>
                <View style={styles.statCopy}>
                  <AppText weight="bold" style={styles.statValue}>{item.successfulSwapsCount}</AppText>
                  <AppText muted style={styles.statLabel}>تبديلات</AppText>
                </View>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <View style={[styles.statIconShell, styles.statIconAccent]}>
                  <Ionicons name="cube-outline" size={14} color={colors.accent} />
                </View>
                <View style={styles.statCopy}>
                  <AppText weight="bold" style={styles.statValue}>{item.activeItemsCount}</AppText>
                  <AppText muted style={styles.statLabel}>عناصر</AppText>
                </View>
              </View>

              {item.responseRate !== null ? (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <View style={[styles.statIconShell, styles.statIconSuccess]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.success} />
                    </View>
                    <View style={styles.statCopy}>
                      <AppText weight="bold" style={styles.statValue}>{item.responseRate}%</AppText>
                      <AppText muted style={styles.statLabel}>معدل الرد</AppText>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          </AppCard>
        </Pressable>
      </AppFadeIn>
    );
  }, []);

  const footer = useMemo(() => {
    if (loadingMore) {
      return (
        <View
          style={styles.loadMoreState}
          accessibilityRole="progressbar"
          accessibilityLabel="جاري تحميل المزيد من الأشخاص"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <AppText muted style={styles.loadMoreStateText}>جاري تحميل المزيد...</AppText>
        </View>
      );
    }

    if (loadMoreError) {
      return (
        <AppCard variant="outlined" padding="md" style={styles.loadMoreErrorCard}>
          <View style={styles.loadMoreErrorCopy} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={17} color={colors.primary} />
            <AppText muted style={styles.loadMoreStateText}>تعذر تحميل المزيد. العناصر الحالية ما زالت ظاهرة.</AppText>
          </View>
          <AppButton label="إعادة المحاولة" variant="neutral" onPress={() => void loadMorePeople(true)} />
        </AppCard>
      );
    }

    return null;
  }, [loadMoreError, loadMorePeople, loadingMore]);

  return (
    <AppScreen backgroundVariant="alive" style={styles.screen}>
      <FlatList
        renderScrollComponent={(props) => (
          <KeyboardAwareScrollView
            {...props}
            bottomOffset={spacing.lg}
          />
        )}
        keyboardDismissMode="on-drag"
        data={people}
        keyExtractor={(item) => item.id}
        renderItem={renderPerson}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onEndReached={() => void loadMorePeople()}
        onEndReachedThreshold={0.35}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          firstPageLoading ? (
            <PeopleLoadingState />
          ) : error ? (
            <AppCard variant="outlined" style={styles.stateCard}>
              <EmptyState
                title="تعذر تحميل ناس تِسوى"
                description="مقدرناش نوصل للملفات الآن. راجع اتصالك وجرّب مرة ثانية."
                iconName="cloud-offline-outline"
                actionLabel="إعادة المحاولة"
                onAction={() => void loadFirstPage(appliedQuery, 'initial')}
              />
            </AppCard>
          ) : hasActiveSearch ? (
            <AppCard variant="outlined" style={styles.stateCard}>
              <EmptyState
                title="ملقيناش الشخص ده"
                description="جرّب الاسم من غير رموز، يوزرنيم مختلف، أو ابحث باسم المدينة."
                iconName="search-outline"
                actionLabel="مسح البحث"
                onAction={handleClearSearch}
              />
            </AppCard>
          ) : (
            <AppCard variant="outlined" style={styles.stateCard}>
              <EmptyState
                title="المجتمع لسه بيتكوّن"
                description="أول ما ملفات جديدة تبقى جاهزة للاستكشاف، هتظهر لك هنا."
                iconName="people-outline"
                actionLabel="اعرض حاجة"
                onAction={() => router.push('/(tabs)/add')}
              />
            </AppCard>
          )
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  heroCard: {
    minHeight: 210,
    borderRadius: radii.xl,
    padding: spacing.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    gap: spacing.sm,
  },
  heroOrbPrimary: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(184,98,63,0.10)',
    top: -66,
    left: -48,
  },
  heroOrbAccent: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(62,124,115,0.11)',
    bottom: -72,
    right: -34,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.round,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,253,248,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
  },
  heroBadgeText: { color: colors.primary, fontSize: 13 },
  title: { fontSize: 27, lineHeight: 35, maxWidth: 310 },
  heroDescription: { lineHeight: 24, maxWidth: 330 },
  heroSignalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  heroSignalDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  heroSignalText: { color: colors.accent, fontSize: 12 },
  searchCard: { gap: spacing.md, borderColor: 'rgba(184,98,63,0.16)' },
  searchTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md },
  searchIconShell: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  searchTitleCopy: { flex: 1, gap: 2 },
  searchTitle: { fontSize: 18 },
  searchHint: { fontSize: 13, lineHeight: 19 },
  searchActions: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  searchPrimaryAction: { flex: 1 },
  resultsSummary: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  resultsSummaryIcon: {
    width: 28,
    height: 28,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  resultsSummaryText: { flex: 1, fontSize: 13 },
  noticeCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    borderColor: 'rgba(62,124,115,0.22)',
    backgroundColor: 'rgba(215,232,229,0.58)',
  },
  noticeIconShell: {
    width: 34,
    height: 34,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20 },
  sectionHeading: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: 20 },
  sectionSubtitle: { fontSize: 13, marginTop: 2 },
  countPill: { minWidth: 38, height: 30, paddingHorizontal: spacing.sm, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  countPillText: { color: colors.primary, fontSize: 13 },
  personPressable: { borderRadius: radii.lg },
  personPressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
  personCard: { gap: spacing.md, overflow: 'hidden', borderColor: 'rgba(184,98,63,0.14)' },
  coverWrap: { borderRadius: radii.md, overflow: 'hidden', height: 118, backgroundColor: colors.primarySoft },
  coverImage: { width: '100%', height: '100%' },
  coverFallback: { width: '100%', height: '100%', overflow: 'hidden' },
  coverFallbackOrbOne: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.26)', top: -42, right: -12 },
  coverFallbackOrbTwo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(62,124,115,0.10)', bottom: -38, left: 18 },
  coverLocationPill: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    maxWidth: '72%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.round,
    backgroundColor: 'rgba(29,26,22,0.58)',
  },
  coverLocationText: { color: colors.white, fontSize: 12, flexShrink: 1 },
  identityRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginTop: -34, paddingHorizontal: spacing.xs },
  avatarAura: { width: 76, height: 76, padding: 3, borderRadius: 38, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)' },
  avatar: { width: '100%', height: '100%', borderRadius: radii.round },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: colors.primary, fontSize: 26 },
  identityBox: { flex: 1, minWidth: 0, gap: 2, paddingTop: spacing.xl },
  displayName: { fontSize: 18, lineHeight: 24 },
  username: { fontSize: 13 },
  openIconShell: { width: 34, height: 34, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, marginTop: spacing.xl },
  identityText: { lineHeight: 22, paddingHorizontal: spacing.xs },
  statsRow: {
    minHeight: 58,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(249,243,234,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(221,208,197,0.72)',
  },
  statItem: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  statIconShell: { width: 28, height: 28, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center' },
  statIconPrimary: { backgroundColor: colors.primarySoft },
  statIconAccent: { backgroundColor: colors.accentSoft },
  statIconSuccess: { backgroundColor: colors.successSoft },
  statCopy: { minWidth: 0 },
  statValue: { fontSize: 14 },
  statLabel: { fontSize: 11 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.border, marginHorizontal: spacing.xs },
  loadingList: { gap: spacing.md },
  skeletonCard: { gap: spacing.md },
  skeletonCover: { height: 112, borderRadius: radii.md, backgroundColor: colors.primarySoft },
  skeletonIdentityRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, marginTop: -34, paddingHorizontal: spacing.xs },
  skeletonAvatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.surface, backgroundColor: '#E8D7CB' },
  skeletonCopy: { flex: 1, gap: spacing.sm, paddingTop: spacing.xl },
  skeletonTitle: { height: 18, width: '55%', borderRadius: radii.sm, backgroundColor: colors.primarySoft },
  skeletonLineSmall: { height: 12, width: '35%', borderRadius: radii.sm, backgroundColor: '#E9E0D8' },
  skeletonLine: { height: 12, width: '82%', borderRadius: radii.sm, backgroundColor: '#E9E0D8' },
  skeletonStats: { height: 54, borderRadius: radii.md, backgroundColor: 'rgba(238,216,203,0.52)' },
  stateCard: { borderColor: 'rgba(184,98,63,0.14)', backgroundColor: 'rgba(255,253,248,0.82)' },
  loadMoreState: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  loadMoreStateText: { fontSize: 13 },
  loadMoreErrorCard: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  loadMoreErrorCopy: { flex: 1, minWidth: 0, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
});
