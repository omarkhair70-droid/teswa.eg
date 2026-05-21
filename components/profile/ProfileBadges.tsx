import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { UserBadge } from '@/lib/badges';

type ProfileBadgesProps = {
  badges: UserBadge[];
  loading?: boolean;
  compact?: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  trust: 'ثقة',
  early: 'بداية',
  swap: 'تبديل',
  community: 'مجتمع',
  profile: 'ملف',
  special: 'خاص',
};

const BADGE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  trust: 'shield-checkmark-outline',
  early: 'sparkles-outline',
  swap: 'swap-horizontal-outline',
  community: 'people-outline',
  profile: 'person-circle-outline',
  special: 'star-outline',
};

function normalizeIconName(iconName: string | null | undefined, category: string): keyof typeof Ionicons.glyphMap {
  if (iconName && iconName in Ionicons.glyphMap) return iconName as keyof typeof Ionicons.glyphMap;
  return BADGE_ICONS[category] ?? 'ribbon-outline';
}

function formatAwardedAt(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function ProfileBadges({ badges, loading = false, compact = false }: ProfileBadgesProps) {
  if (loading) {
    return (
      <AppCard>
        <View style={styles.headerRow}>
          <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
          <AppText weight="semibold">الشارات</AppText>
        </View>
        <AppText muted>جاري تحميل الشارات...</AppText>
      </AppCard>
    );
  }

  if (badges.length === 0) {
    return (
      <AppCard>
        <View style={styles.group}>
          <View style={styles.headerRow}>
            <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
            <AppText weight="semibold">الشارات</AppText>
          </View>
          <AppText weight="semibold">لسه مفيش شارات</AppText>
          <AppText muted>الشارات بتظهر مع أول التبديلات والتقييمات الموثوقة.</AppText>
        </View>
      </AppCard>
    );
  }

  return (
    <AppCard>
      <View style={styles.group}>
        <View style={styles.headerRow}>
          <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
          <AppText weight="semibold">الشارات</AppText>
        </View>

        {!compact ? <AppText muted>علامات بتظهر مع التبديلات والتفاعل الموثوق.</AppText> : null}

        <View style={styles.badgesWrap}>
          {badges.map((badge) => {
            const categoryLabel = CATEGORY_LABELS[badge.category] ?? 'عام';
            const awardedAt = formatAwardedAt(badge.awardedAt);
            const icon = normalizeIconName(badge.iconName, badge.category);

            return (
              <View key={badge.badgeKey} style={styles.badgeCard}>
                <View style={styles.badgeHeader}>
                  <Ionicons name={icon} size={15} color={colors.primary} />
                  <AppText numberOfLines={1} weight="semibold" style={styles.badgeLabel}>{badge.labelAr}</AppText>
                </View>
                <View style={styles.badgeMetaRow}>
                  <View style={styles.categoryPill}>
                    <AppText style={styles.categoryText}>{categoryLabel}</AppText>
                  </View>
                  {awardedAt && !compact ? <AppText muted style={styles.dateText}>{awardedAt}</AppText> : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs },
  badgesWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  badgeCard: {
    minWidth: 120,
    maxWidth: '100%',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 6,
  },
  badgeHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  badgeLabel: { flexShrink: 1 },
  badgeMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  categoryPill: {
    borderRadius: radii.round,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  categoryText: { color: colors.primary, fontSize: 11 },
  dateText: { fontSize: 11 },
});
