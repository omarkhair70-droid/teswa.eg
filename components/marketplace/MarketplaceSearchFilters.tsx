import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type MarketplaceSearchFiltersProps = {
  query: string;
  selectedCategory: string | null;
  selectedCondition: string | null;
  selectedCity: string | null;
  categoryOptions: string[];
  conditionOptions: string[];
  cityOptions: string[];
  loading?: boolean;
  onQueryChange: (value: string) => void;
  onSelectCategory: (value: string | null) => void;
  onSelectCondition: (value: string | null) => void;
  onSelectCity: (value: string | null) => void;
  onClear: () => void;
};

function FilterRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  if (options.length === 0) return null;

  return (
    <View style={styles.rowWrap}>
      <AppText weight="semibold" style={styles.rowLabel}>{label}</AppText>
      <View style={styles.chipsWrap}>
        <Pressable
          style={[styles.chip, !selected && styles.chipActive]}
          onPress={() => onSelect(null)}
          accessibilityRole="button"
        >
          <AppText style={[styles.chipText, !selected && styles.chipTextActive]}>الكل</AppText>
        </Pressable>
        {options.map((option) => (
          <Pressable
            key={option}
            style={[styles.chip, selected === option && styles.chipActive]}
            onPress={() => onSelect(option)}
            accessibilityRole="button"
          >
            <AppText style={[styles.chipText, selected === option && styles.chipTextActive]}>{option}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function MarketplaceSearchFilters({
  query,
  selectedCategory,
  selectedCondition,
  selectedCity,
  categoryOptions,
  conditionOptions,
  cityOptions,
  loading,
  onQueryChange,
  onSelectCategory,
  onSelectCondition,
  onSelectCity,
  onClear,
}: MarketplaceSearchFiltersProps) {
  return (
    <AppCard>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <AppText weight="bold" style={styles.title}>اكتشف اللي يناسبك</AppText>
          <Pressable style={styles.clearBtn} onPress={onClear} disabled={loading}>
            <Ionicons name="refresh-outline" size={15} color={colors.primary} />
            <AppText weight="semibold" style={styles.clearText}>مسح الفلاتر</AppText>
          </Pressable>
        </View>
        <AppText muted>فلتر بهدوء وشوف الحاجات الأقرب للي محتاجه.</AppText>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="دور على حاجة، مدينة، أو نوع..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            textAlign="right"
          />
        </View>

        <FilterRow label="التصنيف" options={categoryOptions} selected={selectedCategory} onSelect={onSelectCategory} />
        <FilterRow label="الحالة" options={conditionOptions} selected={selectedCondition} onSelect={onSelectCondition} />
        <FilterRow label="المدينة" options={cityOptions} selected={selectedCity} onSelect={onSelectCity} />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  titleRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 18 },
  clearBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  clearText: { color: colors.primary, fontSize: 12 },
  searchBox: {
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    borderRadius: radii.lg,
    backgroundColor: 'rgba(255,253,248,0.92)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: spacing.xs },
  rowWrap: { gap: spacing.xs },
  rowLabel: { fontSize: 13 },
  chipsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(221,208,197,0.9)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(184,98,63,0.12)' },
  chipText: { fontSize: 12, color: colors.textMuted },
  chipTextActive: { color: colors.primary },
});
