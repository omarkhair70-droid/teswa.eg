import { PropsWithChildren } from 'react';
import { type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { TeswaAmbientBackground } from '@/components/ui/TeswaAmbientBackground';
import type { TeswaAmbientBackgroundVariant } from '@/components/ui/TeswaAmbientBackground';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type AppScreenBackgroundVariant = TeswaAmbientBackgroundVariant | 'none';

type AppScreenProps = PropsWithChildren<{
  scrollable?: boolean;
  style?: ViewStyle;
  backgroundVariant?: AppScreenBackgroundVariant;
}>;

const createStyles = (colors: TeswaThemeColors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    overflow: 'hidden' as const,
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
});

export function AppScreen({
  children,
  scrollable = false,
  style,
  backgroundVariant = 'soft',
}: AppScreenProps) {
  const styles = useTeswaStyles(createStyles);
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
      {backgroundVariant !== 'none' ? <TeswaAmbientBackground variant={backgroundVariant} /> : null}
      {content}
    </SafeAreaView>
  );
}
