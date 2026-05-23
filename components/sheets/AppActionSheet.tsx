import { forwardRef, I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import type { AppActionSheetProps, AppActionSheetTone } from '@/components/sheets/types';
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
        {actions.map((action) => {
          const tone = action.tone ?? 'neutral';
          const color = getToneColor(tone);
          return (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: action.disabled }}
              disabled={action.disabled}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && !action.disabled && styles.actionRowPressed,
                action.disabled && styles.actionRowDisabled,
              ]}
            >
              <View style={styles.actionContent}>
                {action.iconName ? <Ionicons name={action.iconName} size={20} color={color} /> : null}
                <AppText weight="medium" style={[styles.actionText, { color }]}>{action.label}</AppText>
              </View>
            </Pressable>
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

const styles = StyleSheet.create({
  actionsWrap: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  actionRow: {
    minHeight: 52,
    borderRadius: radii.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionRowPressed: {
    opacity: 0.85,
  },
  actionRowDisabled: {
    opacity: 0.45,
  },
  actionContent: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionText: {
    flex: 1,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
});
