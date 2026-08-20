import { forwardRef, useMemo } from 'react';
import { I18nManager, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';

import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppText } from '@/components/ui/AppText';
import { radii } from '@/constants/radii';
import { shadows } from '@/constants/shadows';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import type { AppBottomSheetProps } from '@/components/sheets/types';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

const createStyles = (colors: TeswaThemeColors) => ({
  background: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, ...shadows.card, shadowColor: colors.shadow },
  handleIndicator: { backgroundColor: colors.border, width: 44 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  header: { gap: spacing.sm, paddingTop: spacing.xs, alignItems: I18nManager.isRTL ? 'flex-end' as const : 'flex-start' as const },
  titleRow: { flexDirection: I18nManager.isRTL ? 'row-reverse' as const : 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  titleIconWrap: { width: 28, height: 28, borderRadius: radii.round, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.primarySoft },
  title: { fontSize: 19, color: colors.text, textAlign: I18nManager.isRTL ? 'right' as const : 'left' as const },
  description: { color: colors.textMuted, textAlign: I18nManager.isRTL ? 'right' as const : 'left' as const, lineHeight: 20 },
  headerDivider: { height: 1, backgroundColor: colors.border, opacity: 0.7 },
});

export const AppBottomSheet = forwardRef<BottomSheetModal, AppBottomSheetProps>(function AppBottomSheet(
  { title, description, titleIconName, children, snapPoints, onClose, enablePanDownToClose = true },
  ref,
) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const resolvedSnapPoints = useMemo(() => snapPoints ?? ['35%', '70%'], [snapPoints]);
  const renderBackdrop = (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />;

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={resolvedSnapPoints}
      onDismiss={onClose}
      enablePanDownToClose={enablePanDownToClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.background}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={styles.content}>
        {(title || description) ? (
          <AppFadeIn style={styles.header}>
            {title ? (
              <View style={styles.titleRow}>
                {titleIconName ? <View style={styles.titleIconWrap}><Ionicons name={titleIconName} size={16} color={colors.primary} /></View> : null}
                <AppText weight="semibold" style={styles.title}>{title}</AppText>
              </View>
            ) : null}
            {description ? <AppText muted style={styles.description}>{description}</AppText> : null}
          </AppFadeIn>
        ) : null}
        {(title || description) ? <View style={styles.headerDivider} /> : null}
        <AppFadeIn delay={40}>{children}</AppFadeIn>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
