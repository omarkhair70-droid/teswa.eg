import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type HubAction = { label: string; description: string; iconName: IoniconName; tone?: 'primary' | 'neutral'; onPress: () => void };

export function HomeHubDrawer({ visible, onClose, actions }: { visible: boolean; onClose: () => void; actions: HubAction[] }) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  const containerTransform = useMemo(
    () => ({ transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }] }),
    [progress],
  );

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق مركز تسوى" />
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.26] }) }]} />
        <Animated.View style={[styles.drawer, containerTransform]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText weight="semibold" style={styles.eyebrow}>اختصاراتك</AppText>
              <AppText weight="bold" style={styles.title}>مركز تِسوى</AppText>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="إغلاق مركز تسوى">
              <Ionicons name="close" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <AppText muted style={styles.subtitle}>كل الوجهات المهمة، مرتبة لتصل لها بخطوة واحدة.</AppText>
          <View style={styles.actionsList}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <View style={[styles.iconWrap, action.tone === 'primary' ? styles.iconWrapPrimary : null]}>
                  <Ionicons name={action.iconName} size={18} color={action.tone === 'primary' ? colors.white : colors.primary} />
                </View>
                <View style={styles.copyWrap}>
                  <AppText weight="semibold">{action.label}</AppText>
                  <AppText muted style={styles.actionDesc}>{action.description}</AppText>
                </View>
                <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-start', paddingTop: spacing.lg },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#2B2118' },
  drawer: {
    marginRight: spacing.md,
    width: '88%',
    maxWidth: 360,
    alignSelf: 'flex-end',
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: 'rgba(184,98,63,0.2)',
    backgroundColor: 'rgba(255,251,246,0.97)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: 2 },
  eyebrow: { color: colors.primary, fontSize: 11 },
  title: { fontSize: 23 },
  closeButton: { width: 38, height: 38, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', backgroundColor: colors.white },
  subtitle: { fontSize: 13, lineHeight: 20 },
  actionsList: { gap: spacing.xs },
  actionRow: { minHeight: 68, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderRadius: radii.lg, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  actionRowPressed: { opacity: 0.78, backgroundColor: 'rgba(184,98,63,0.06)', borderColor: 'rgba(184,98,63,0.12)' },
  iconWrap: { width: 38, height: 38, borderRadius: radii.md, backgroundColor: 'rgba(184,98,63,0.1)', alignItems: 'center', justifyContent: 'center' },
  iconWrapPrimary: { backgroundColor: colors.primary },
  copyWrap: { flex: 1, gap: 2 },
  actionDesc: { fontSize: 12, lineHeight: 18 },
});
