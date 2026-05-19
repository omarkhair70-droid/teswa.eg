import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type TeswaMomentCardProps = {
  eyebrow?: string;
  title: string;
  body: string;
  icon:
    | 'paper-plane-outline'
    | 'hourglass-outline'
    | 'heart-dislike-outline'
    | 'checkmark-circle-outline'
    | 'chatbubble-ellipses-outline'
    | 'sparkles-outline'
    | 'swap-horizontal-outline'
    | string;
  tone?: 'warm' | 'success' | 'waiting' | 'calm';
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

const toneStyles = {
  warm: {
    gradient: ['#FFF7EC', '#FFEAD2', '#FDF4EA'],
    borderColor: '#E6C8AE',
    iconBg: 'rgba(184, 98, 63, 0.16)',
    iconColor: colors.primary,
  },
  success: {
    gradient: ['#F3FBF8', '#E7F4F0', '#F8FDFC'],
    borderColor: '#BFD9D3',
    iconBg: 'rgba(62, 124, 115, 0.16)',
    iconColor: colors.accent,
  },
  waiting: {
    gradient: ['#FFF9EF', '#FFF0DD', '#FFF8EC'],
    borderColor: '#E9D4B8',
    iconBg: 'rgba(186, 124, 66, 0.16)',
    iconColor: '#9A5E2F',
  },
  calm: {
    gradient: ['#F8F7F5', '#F1EEEB', '#FCFAF8'],
    borderColor: '#D8D0C8',
    iconBg: 'rgba(116, 106, 97, 0.16)',
    iconColor: colors.textMuted,
  },
} as const;

export function TeswaMomentCard({
  eyebrow,
  title,
  body,
  icon,
  tone = 'warm',
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: TeswaMomentCardProps) {
  const toneStyle = toneStyles[tone];

  return (
    <LinearGradient colors={toneStyle.gradient} style={[styles.card, { borderColor: toneStyle.borderColor }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <View style={styles.headerRow}>
        <View style={[styles.iconShell, { backgroundColor: toneStyle.iconBg }]}>
          <Ionicons name={icon as never} size={22} color={toneStyle.iconColor} />
        </View>
        <View style={styles.textCol}>
          {eyebrow ? <AppText style={styles.eyebrow}>{eyebrow}</AppText> : null}
          <AppText weight="bold" style={styles.title}>{title}</AppText>
          <AppText muted style={styles.body}>{body}</AppText>
        </View>
      </View>
      {primaryActionLabel || secondaryActionLabel ? (
        <View style={styles.actionsRow}>
          {secondaryActionLabel ? (
            <Pressable style={styles.secondaryAction} onPress={onSecondaryAction}>
              <AppText weight="semibold">{secondaryActionLabel}</AppText>
            </Pressable>
          ) : null}
          {primaryActionLabel ? (
            <Pressable style={styles.primaryAction} onPress={onPrimaryAction}>
              <AppText weight="semibold" style={styles.primaryActionText}>{primaryActionLabel}</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#2B1B14',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconShell: {
    width: 40,
    height: 40,
    borderRadius: radii.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.textMuted, fontSize: 12 },
  title: { fontSize: 18, color: colors.text },
  body: { lineHeight: 20 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  primaryAction: {
    backgroundColor: colors.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  primaryActionText: { color: colors.white },
  secondaryAction: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
});
