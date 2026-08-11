import { ComponentProps, PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
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
      <LinearGradient colors={['#FFF6EC', '#FFE8D3', 'rgba(62,124,115,0.16)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.orbOne} />
        <View style={styles.orbTwo} />
        <View style={styles.brandRow}>
          <View style={styles.iconShell}><Ionicons name={icon} size={23} color={colors.primary} /></View>
          <View style={styles.brandCopy}><AppText muted style={styles.brandLabel}>تِسوى</AppText><AppText weight="semibold" style={styles.brandLine}>بدّل حاجة بحاجه تستاهل</AppText></View>
        </View>
        <View style={styles.heroCopy}>
          {eyebrow ? <AppText style={styles.eyebrow}>{eyebrow}</AppText> : null}
          <AppText weight="bold" style={styles.title}>{title}</AppText>
          <AppText muted style={styles.body}>{body}</AppText>
        </View>
        <View style={styles.trustRow}>
          <View style={styles.trustPill}><Ionicons name="shield-checkmark-outline" size={13} color={colors.accent} /><AppText style={styles.trustText}>حسابك محمي</AppText></View>
          <View style={styles.trustPill}><Ionicons name="phone-portrait-outline" size={13} color={colors.textMuted} /><AppText style={styles.trustText}>مصمم للموبايل</AppText></View>
        </View>
      </LinearGradient>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  hero: { borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: 'rgba(184,98,63,0.16)', gap: spacing.lg, overflow: 'hidden' },
  orbOne: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.44)', top: -54, right: -32 },
  orbTwo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(62,124,115,0.10)', bottom: -46, left: -26 },
  brandRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm },
  iconShell: { width: 46, height: 46, borderRadius: radii.lg, backgroundColor: 'rgba(255,255,255,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  brandCopy: { flex: 1, alignItems: 'flex-end', gap: 1 },
  brandLabel: { fontSize: 11 },
  brandLine: { fontSize: 12, textAlign: 'right' },
  heroCopy: { alignItems: 'flex-end', gap: 5 },
  eyebrow: { color: colors.primary, fontSize: 12 },
  title: { fontSize: 29, lineHeight: 38, textAlign: 'right' },
  body: { lineHeight: 23, textAlign: 'right' },
  trustRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.xs },
  trustPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.round, backgroundColor: 'rgba(255,255,255,0.70)' },
  trustText: { fontSize: 10, color: colors.textMuted },
  content: { gap: spacing.md },
});
