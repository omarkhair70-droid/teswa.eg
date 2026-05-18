import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
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

export default function PeopleScreen() {
  const [people, setPeople] = useState<PeopleDirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadPeople = useCallback(async (nextQuery: string) => {
    setLoading(true);
    setError(false);

    try {
      const entries = await fetchPeopleDirectory({ query: nextQuery });
      setPeople(entries);
    } catch {
      setError(true);
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
        <AppText weight="bold" style={styles.title}>ناس تِسوى</AppText>
        <AppText muted>اكتشف أشخاصًا يعرضون حاجاتهم، يحكون عنها، ويفتحون باب تبادل جديد.</AppText>
        <AppInput value={query} onChangeText={setQuery} placeholder="ابحث بالاسم أو اليوزرنيم أو المدينة" />
        <View style={styles.searchActions}>
          <AppButton label="بحث" onPress={handleSearch} disabled={loading} />
          {hasActiveSearch ? <AppButton label="مسح البحث" variant="neutral" onPress={handleClearSearch} disabled={loading} /> : null}
        </View>
      </View>
    ),
    [handleClearSearch, handleSearch, hasActiveSearch, loading, query],
  );

  const renderPerson = useCallback(({ item }: { item: PeopleDirectoryEntry }) => {
    const location = [item.city, item.area].filter(Boolean).join(' • ');
    const identityText = item.profileTagline || item.bio;
    const firstChar = (item.displayName || item.username || 'م').trim().charAt(0).toUpperCase();

    return (
      <Pressable onPress={() => router.push(`/profile/${item.id}`)}>
        <AppCard>
          <View style={styles.personCard}>
            <View style={styles.topRow}>
              {item.avatarUrl ? (
                <ExpoImage source={{ uri: item.avatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarFallback}><AppText weight="bold" style={styles.avatarFallbackText}>{firstChar}</AppText></View>
              )}
              <View style={styles.identityBox}>
                <AppText weight="semibold">{item.displayName}</AppText>
                <AppText muted>@{item.username}</AppText>
              </View>
            </View>

            {location ? <AppText muted>{location}</AppText> : null}
            {identityText ? <AppText muted numberOfLines={2}>{identityText}</AppText> : null}

            <View style={styles.signalRow}>
              <AppText muted>مقايضات ناجحة: {item.successfulSwapsCount}</AppText>
              <AppText muted>عناصر نشطة: {item.activeItemsCount}</AppText>
              {item.responseRate !== null ? <AppText muted>معدل الرد: {item.responseRate}%</AppText> : null}
            </View>
          </View>
        </AppCard>
      </Pressable>
    );
  }, []);

  return (
    <AppScreen style={styles.screen}>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        renderItem={renderPerson}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <EmptyState title="جاري التحميل" description="نجهز لك ناس تِسوى." />
          ) : error ? (
            <View style={styles.stateBox}>
              <EmptyState title="تعذر تحميل ناس تِسوى" description="حاول مرة أخرى بعد قليل." />
              <AppButton label="إعادة المحاولة" onPress={() => loadPeople(appliedQuery)} />
            </View>
          ) : hasActiveSearch ? (
            <View style={styles.stateBox}>
              <EmptyState title="ملقيناش ناس بالبحث ده" description="جرّب اسمًا آخر أو مدينة مختلفة." />
              <AppButton label="مسح البحث" variant="neutral" onPress={handleClearSearch} />
            </View>
          ) : (
            <View style={styles.stateBox}>
              <EmptyState title="لسه ناس تِسوى بيظهروا هنا" description="كل ما الملفات تتكمل والعناصر تتحرك، هتلاقي الوجوه والحكايات أوضح." />
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
  title: { fontSize: 24 },
  searchActions: { gap: spacing.sm },
  personCard: { gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: radii.round, backgroundColor: colors.primarySoft },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: radii.round,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: { color: colors.primary },
  identityBox: { flex: 1, gap: spacing.xs },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stateBox: { gap: spacing.md },
});
