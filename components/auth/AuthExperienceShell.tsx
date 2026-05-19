import { ComponentProps, PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

type AuthExperienceShellProps = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  body: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}>;

export function AuthExperienceShell({ eyebrow, title, body, icon, children }: AuthExperienceShellProps) {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF4E6', '#F7E0D2', 'rgba(62,124,115,0.20)']} style={styles.hero}>
        <View style={styles.orbOne} />
        <View style={styles.orbTwo} />
        <View style={styles.iconShell}>
          <Ionicons name={icon} size={24} color={colors.primary} />
        </View>
        {eyebrow ? <AppText style={styles.eyebrow}>{eyebrow}</AppText> : null}
        <AppText weight="bold" style={styles.title}>{title}</AppText>
        <AppText style={styles.body}>{body}</AppText>
      </LinearGradient>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  hero: { borderRadius: 24, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(184,98,63,0.2)', gap: spacing.sm, overflow: 'hidden' },
  orbOne: { position: 'absolute', width: 110, height: 110, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.4)', top: -28, right: -18 },
  orbTwo: { position: 'absolute', width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(184,98,63,0.12)', bottom: -18, left: -10 },
  iconShell: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.78)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 12 },
  title: { fontSize: 28, lineHeight: 38 },
  body: { color: colors.textMuted, lineHeight: 24 },
});
