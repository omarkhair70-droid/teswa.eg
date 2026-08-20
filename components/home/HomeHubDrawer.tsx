import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { AppText } from '@/components/ui/AppText';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import type { TeswaThemeColors } from '@/constants/themes';
import { useTeswaColors, useTeswaStyles } from '@/lib/theme/use-teswa-theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type HubAction = { label: string; description: string; iconName: IoniconName; tone?: 'primary' | 'neutral'; onPress: () => void };

const createStyles = (colors: TeswaThemeColors) => ({
  overlay: { flex: 1, justifyContent: 'flex-start' as const, paddingTop: spacing.lg },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.black },
  drawer: { marginRight: spacing.md, width: '88%' as const, maxWidth: 360, alignSelf: 'flex-end' as const, borderRadius: radii.xxl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row-reverse' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: colors.primary, fontSize: 11 },
  title: { fontSize: 23 },
  closeButton: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  subtitle: { fontSize: 13, lineHeight: 20 },
  actionsList: { gap: spacing.xs },
  actionRow: { minHeight: 68, flexDirection: 'row-reverse' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.lg, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  actionRowPressed: { opacity: 0.78, backgroundColor: colors.primarySoft, borderColor: colors.border },
  iconWrap: { width: 38, height: 38, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center' as const, justifyContent: 'center' as const },
  iconWrapPrimary: { backgroundColor: colors.primary },
  copyWrap: { flex: 1, gap: 2 },
  actionDesc: { fontSize: 12, lineHeight: 18 },
});

export function HomeHubDrawer({ visible, onClose, actions }: { visible: boolean; onClose: () => void; actions: HubAction[] }) {
  const colors = useTeswaColors();
  const styles = useTeswaStyles(createStyles);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, { toValue: visible ? 1 : 0, duration: visible ? 240 : 200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  }, [progress, visible]);

  const containerTransform = useMemo(() => ({ transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }] }), [progress]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق مركز تسوى" />
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.34] }) }]} />
        <Animated.View style={[styles.drawer, containerTransform]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}><AppText weight="semibold" style={styles.eyebrow}>اختصاراتك</AppText><AppText weight="bold" style={styles.title}>مركز تِسوى</AppText></View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="إغلاق مركز تسوى"><Ionicons name="close" size={20} color={colors.primary} /></Pressable>
          </View>
          <AppText muted style={styles.subtitle}>كل الوجهات المهمة، مرتبة لتصل لها بخطوة واحدة.</AppText>
          <View style={styles.actionsList}>
            {actions.map((action) => (
              <Pressable key={action.label} style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
                <View style={[styles.iconWrap, action.tone === 'primary' ? styles.iconWrapPrimary : null]}><Ionicons name={action.iconName} size={18} color={action.tone === 'primary' ? colors.white : colors.primary} /></View>
                <View style={styles.copyWrap}><AppText weight="semibold">{action.label}</AppText><AppText muted style={styles.actionDesc}>{action.description}</AppText></View>
                <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
