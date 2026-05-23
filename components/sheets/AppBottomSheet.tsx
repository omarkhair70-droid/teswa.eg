import { forwardRef, useMemo } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
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
    titleIconName,
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
            {title ? (
              <View style={styles.titleRow}>
                {titleIconName ? (
                  <View style={styles.titleIconWrap}>
                    <Ionicons name={titleIconName} size={16} color={colors.primary} />
                  </View>
                ) : null}
                <AppText weight="semibold" style={styles.title}>{title}</AppText>
              </View>
            ) : null}
            {description ? <AppText muted style={styles.description}>{description}</AppText> : null}
          </AppFadeIn>
        ) : null}
        {(title || description) ? <View style={styles.headerDivider} /> : null}
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
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
  },
  titleRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  title: {
    fontSize: 19,
    color: colors.text,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  description: {
    color: colors.textMuted,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    lineHeight: 20,
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.7,
  },
});
