import { forwardRef } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import type { AppActionSheetProps, AppActionSheetTone } from '@/components/sheets/types';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

export const AppActionSheet = forwardRef<BottomSheetModal, AppActionSheetProps>(function AppActionSheet(
  { title, description, actions, onClose, snapPoints },
  ref,
) {
  return (
    <AppBottomSheet ref={ref} title={title} description={description} onClose={onClose} snapPoints={snapPoints}>
      <View style={styles.actionsWrap}>
        {actions.map((action, index) => {
          const tone = action.tone ?? 'neutral';
          const toneColor = getToneColor(tone);
          return (
            <AppFadeIn key={action.label} delay={index * 28} fromY={6}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: action.disabled }}
                disabled={action.disabled}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.actionRow,
                  tone === 'danger' && styles.actionRowDanger,
                  pressed && !action.disabled && styles.actionRowPressed,
                  action.disabled && styles.actionRowDisabled,
                ]}
              >
                <View style={styles.actionContent}>
                  {action.iconName ? (
                    <View style={[styles.iconWrap, getIconWrapToneStyle(tone)]}>
                      <Ionicons name={action.iconName} size={18} color={toneColor} />
                    </View>
                  ) : null}
                  <View style={styles.textWrap}>
                    <AppText weight="medium" style={[styles.actionText, { color: toneColor }]}>{action.label}</AppText>
                    {action.description ? <AppText muted style={styles.actionDescription}>{action.description}</AppText> : null}
                  </View>
                </View>
              </Pressable>
            </AppFadeIn>
          );
        })}
      </View>
    </AppBottomSheet>
  );
});

function getToneColor(tone: AppActionSheetTone) {
  switch (tone) {
    case 'primary':
      return colors.primary;
    case 'danger':
      return colors.danger;
    default:
      return colors.text;
  }
}

function getIconWrapToneStyle(tone: AppActionSheetTone) {
  switch (tone) {
    case 'primary':
      return styles.iconWrapPrimary;
    case 'danger':
      return styles.iconWrapDanger;
    default:
      return styles.iconWrapNeutral;
  }
}

const styles = StyleSheet.create({
  actionsWrap: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  actionRow: {
    minHeight: 58,
    borderRadius: radii.lg,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionRowDanger: {
    borderColor: colors.dangerSoft,
  },
  actionRowPressed: {
    opacity: 0.88,
  },
  actionRowDisabled: {
    opacity: 0.45,
  },
  actionContent: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapNeutral: {
    backgroundColor: colors.background,
  },
  iconWrapPrimary: {
    backgroundColor: colors.primarySoft,
  },
  iconWrapDanger: {
    backgroundColor: colors.dangerSoft,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  actionText: {
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  actionDescription: {
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    lineHeight: 18,
  },
});
