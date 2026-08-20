import { forwardRef } from 'react';
import { I18nManager, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppBottomSheet } from '@/components/sheets/AppBottomSheet';
import type { AppActionSheetProps, AppActionSheetTone } from '@/components/sheets/types';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppText } from '@/components/ui/AppText';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

const createStyles = (colors: TeswaThemeColors) => ({
  actionsWrap: { gap: spacing.sm, paddingTop: spacing.xs },
  actionRow: { minHeight: 58, borderRadius: radii.lg, justifyContent: 'center' as const, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  actionRowDanger: { borderColor: colors.dangerSoft },
  actionRowPressed: { opacity: 0.88 },
  actionRowDisabled: { opacity: 0.45 },
  actionContent: { flexDirection: I18nManager.isRTL ? 'row-reverse' as const : 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  iconWrap: { width: 30, height: 30, borderRadius: radii.round, alignItems: 'center' as const, justifyContent: 'center' as const },
  iconWrapNeutral: { backgroundColor: colors.neutralSoft },
  iconWrapPrimary: { backgroundColor: colors.primarySoft },
  iconWrapDanger: { backgroundColor: colors.dangerSoft },
  textWrap: { flex: 1, gap: 2 },
  actionText: { textAlign: I18nManager.isRTL ? 'right' as const : 'left' as const },
  actionDescription: { textAlign: I18nManager.isRTL ? 'right' as const : 'left' as const, lineHeight: 18 },
});

export const AppActionSheet = forwardRef<BottomSheetModal, AppActionSheetProps>(function AppActionSheet(
  { title, description, titleIconName, actions, onClose, snapPoints },
  ref,
) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const getToneColor = (tone: AppActionSheetTone) => tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.text;
  const getIconWrapToneStyle = (tone: AppActionSheetTone) => tone === 'primary' ? styles.iconWrapPrimary : tone === 'danger' ? styles.iconWrapDanger : styles.iconWrapNeutral;

  return (
    <AppBottomSheet ref={ref} title={title} description={description} titleIconName={titleIconName} onClose={onClose} snapPoints={snapPoints}>
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
                style={({ pressed }) => [styles.actionRow, tone === 'danger' && styles.actionRowDanger, pressed && !action.disabled && styles.actionRowPressed, action.disabled && styles.actionRowDisabled]}
              >
                <View style={styles.actionContent}>
                  {action.iconName ? <View style={[styles.iconWrap, getIconWrapToneStyle(tone)]}><Ionicons name={action.iconName} size={18} color={toneColor} /></View> : null}
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
