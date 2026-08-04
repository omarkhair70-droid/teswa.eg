import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type DiscoverWorldHeaderProps = {
  onOpenPeople: () => void;
  onOpenMotion: () => void;
  onBrowseItems: () => void;
};

function PathButton({
  iconName,
  label,
  description,
  onPress,
}: {
  iconName: IoniconName;
  label: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pathButton, pressed && styles.pathButtonPressed]}
    >
      <View style={styles.pathIcon}>
        <Ionicons name={iconName} size={18} color={colors.primary} />
      </View>
      <View style={styles.pathCopy}>
        <AppText weight="bold" style={styles.pathLabel}>{label}</AppText>
        <AppText muted numberOfLines={2} style={styles.pathDescription}>{description}</AppText>
      </View>
      <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export function DiscoverWorldHeader({ onOpenPeople, onOpenMotion, onBrowseItems }: DiscoverWorldHeaderProps) {
  return (
    <LinearGradient
      colors={['#FFF9F1', '#FBE4CB', 'rgba(62,124,115,0.18)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <View style={styles.orbOne} />
      <View style={styles.orbTwo} />

      <View style={styles.topRow}>
        <View style={styles.badge}>
          <Ionicons name="compass-outline" size={14} color={colors.primary} />
          <AppText weight="semibold" style={styles.badgeText}>اكتشف في تِسوى</AppText>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <AppText weight="semibold" style={styles.liveText}>المشهد حيّ</AppText>
        </View>
      </View>

      <View style={styles.heroCopy}>
        <AppText weight="bold" style={styles.title}>كل حاجة ممكن تفتح لك باب</AppText>
        <AppText muted style={styles.subtitle}>
          ابدأ بعنصر، شخص، أو حكاية. رتّبنا لك عالم تِسوى عشان توصل للاكتشاف المناسب من غير زحمة.
        </AppText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ابدأ تصفح العناصر"
        onPress={onBrowseItems}
        style={({ pressed }) => [styles.primaryPath, pressed && styles.primaryPathPressed]}
      >
        <View style={styles.primaryPathIcon}>
          <Ionicons name="cube-outline" size={20} color={colors.white} />
        </View>
        <View style={styles.primaryPathCopy}>
          <AppText weight="bold" style={styles.primaryPathTitle}>ابدأ بالعناصر</AppText>
          <AppText style={styles.primaryPathDescription}>ابحث وفلتر وشوف الجديد الجاهز للتبديل</AppText>
        </View>
        <Ionicons name="arrow-back" size={18} color={colors.white} />
      </Pressable>

      <View style={styles.secondaryPaths}>
        <PathButton iconName="people-outline" label="الناس" description="ملفات وعناصر وحكايات" onPress={onOpenPeople} />
        <PathButton iconName="pulse-outline" label="الحركة" description="قصص ولمحات تحدث الآن" onPress={onOpenMotion} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.18)',
    gap: spacing.lg,
    overflow: 'hidden',
  },
  orbOne: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,255,255,0.36)',
    top: -85,
    left: -60,
  },
  orbTwo: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: radii.round,
    backgroundColor: 'rgba(62,124,115,0.08)',
    bottom: -70,
    right: -38,
  },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  badge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.round,
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
  },
  badgeText: { color: colors.primary, fontSize: 12 },
  livePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: radii.round, backgroundColor: colors.accent },
  liveText: { color: colors.accent, fontSize: 11 },
  heroCopy: { gap: spacing.sm },
  title: { fontSize: 29, lineHeight: 38, maxWidth: 310 },
  subtitle: { fontSize: 14, lineHeight: 23, maxWidth: 330 },
  primaryPath: {
    minHeight: 76,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    padding: spacing.md,
    backgroundColor: colors.primary,
  },
  primaryPathPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  primaryPathIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  primaryPathCopy: { flex: 1, gap: 3 },
  primaryPathTitle: { color: colors.white, fontSize: 16 },
  primaryPathDescription: { color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 18 },
  secondaryPaths: { flexDirection: 'row-reverse', gap: spacing.sm },
  pathButton: {
    flex: 1,
    minHeight: 92,
    alignItems: 'flex-start',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.16)',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  pathButtonPressed: { opacity: 0.78, backgroundColor: 'rgba(255,255,255,0.9)' },
  pathIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(184,98,63,0.1)',
  },
  pathCopy: { flex: 1, gap: 2 },
  pathLabel: { fontSize: 14 },
  pathDescription: { fontSize: 11, lineHeight: 16 },
});
