import { forwardRef, useMemo } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { AppFadeIn } from '@/components/motion/AppFadeIn';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { shadows } from '@/constants/shadows';
import { spacing } from '@/constants/spacing';
import type { AppBottomSheetProps } from '@/components/sheets/types';

export const AppBottomSheet = forwardRef<BottomSheetModal, AppBottomSheetProps>(function AppBottomSheet(
  {
    title,
    description,
    children,
    snapPoints,
    onClose,
    enablePanDownToClose = true,
  },
  ref,
) {
  const resolvedSnapPoints = useMemo(() => snapPoints ?? ['35%', '70%'], [snapPoints]);

  const renderBackdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
  );

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
            {title ? <AppText weight="semibold" style={styles.title}>{title}</AppText> : null}
            {description ? <AppText muted style={styles.description}>{description}</AppText> : null}
          </AppFadeIn>
        ) : null}
        <AppFadeIn delay={40}>
          {children}
        </AppFadeIn>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    ...shadows.card,
  },
  handleIndicator: {
    backgroundColor: colors.border,
    width: 44,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
  },
  title: {
    fontSize: 18,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  description: {
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
});
