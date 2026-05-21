import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { formatRadiusLabel } from '@/lib/location-discovery';

type LocationRadiusFilterProps = {
  enabled: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  selectedRadiusKm: number;
  radiusOptions: number[];
  disabledReason?: string | null;
  onToggle: (enabled: boolean) => void;
  onSelectRadius: (radiusKm: number) => void;
  onRetry?: () => void;
};

export function LocationRadiusFilter({
  enabled,
  loading,
  errorMessage,
  selectedRadiusKm,
  radiusOptions,
  disabledReason,
  onToggle,
  onSelectRadius,
  onRetry,
}: LocationRadiusFilterProps) {
  return (
    <AppCard>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            <AppText weight="bold" style={styles.title}>قريب منك</AppText>
            <AppText muted>اعرض حاجات في نطاق قريب منك من غير ما نعرض موقعك للناس.</AppText>
          </View>
          <Pressable style={styles.toggleBtn} onPress={() => onToggle(!enabled)} disabled={loading}>
            <Ionicons name={enabled ? 'location' : 'location-outline'} size={16} color={colors.primary} />
            <AppText weight="semibold" style={styles.toggleText}>{enabled ? 'إيقاف القريب مني' : 'تفعيل القريب مني'}</AppText>
          </Pressable>
        </View>

        <View style={styles.chipsRow}>
          {radiusOptions.map((radiusKm) => {
            const selected = selectedRadiusKm === radiusKm;
            return (
              <Pressable
                key={radiusKm}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => onSelectRadius(radiusKm)}
                disabled={!enabled || loading}
              >
                <AppText style={[styles.chipText, selected && styles.chipTextActive]}>{formatRadiusLabel(radiusKm)}</AppText>
              </Pressable>
            );
          })}
        </View>

        {disabledReason ? <AppText style={styles.disabledNote}>{disabledReason}</AppText> : null}
        {errorMessage ? (
          <View style={styles.errorRow}>
            <AppText style={styles.errorText}>{errorMessage}</AppText>
            {onRetry ? <Pressable onPress={onRetry}><AppText style={styles.retryText}>إعادة المحاولة</AppText></Pressable> : null}
          </View>
        ) : null}

        <View style={styles.safetyRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} />
          <AppText muted style={styles.safetyText}>الموقع يُستخدم للبحث فقط، ومش بيظهر للمستخدمين.</AppText>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  titleRow: { gap: spacing.sm },
  titleWrap: { gap: spacing.xs },
  title: { fontSize: 18 },
  toggleBtn: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs },
  toggleText: { color: colors.primary, fontSize: 13 },
  chipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: 'rgba(221,208,197,0.9)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: 'rgba(62,124,115,0.14)' },
  chipText: { fontSize: 12, color: colors.textMuted },
  chipTextActive: { color: colors.accent },
  disabledNote: { color: colors.textMuted, fontSize: 12 },
  errorRow: { gap: spacing.xs, backgroundColor: 'rgba(180,35,24,0.08)', borderRadius: radii.md, padding: spacing.sm },
  errorText: { color: '#B42318' },
  retryText: { color: colors.primary, fontSize: 12 },
  safetyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  safetyText: { flex: 1, fontSize: 12 },
});
