import { PropsWithChildren } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { TeswaAmbientBackground } from '@/components/ui/TeswaAmbientBackground';
import type { TeswaAmbientBackgroundVariant } from '@/components/ui/TeswaAmbientBackground';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

type AppScreenBackgroundVariant = TeswaAmbientBackgroundVariant | 'none';

type AppScreenProps = PropsWithChildren<{
  scrollable?: boolean;
  style?: ViewStyle;
  backgroundVariant?: AppScreenBackgroundVariant;
}>;

export function AppScreen({
  children,
  scrollable = false,
  style,
  backgroundVariant = 'soft',
}: AppScreenProps) {
  const content = scrollable ? (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.content}
      bottomOffset={spacing.lg}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </KeyboardAwareScrollView>
  ) : (
    children
  );

  return (
    <SafeAreaView style={[styles.container, style]}>
      {backgroundVariant !== 'none' ? (
        <TeswaAmbientBackground variant={backgroundVariant} />
      ) : null}

      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});