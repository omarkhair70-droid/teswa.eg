import { PropsWithChildren } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export function AppScreen({ children, scrollable = false, style }: PropsWithChildren<{ scrollable?: boolean; style?: ViewStyle }>) {
  const content = scrollable ? <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView> : children;
  return <SafeAreaView style={[styles.container, style]}>{content}</SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  content: { paddingBottom: spacing.xxl, gap: spacing.lg },
});
