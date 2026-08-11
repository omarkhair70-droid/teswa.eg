import { StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import type { NotificationPreferences } from '@/lib/notification-preferences';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';

type ToggleKey = keyof Pick<NotificationPreferences, 'offersEnabled' | 'dealsEnabled' | 'messagesEnabled' | 'socialEnabled' | 'smartRemindersEnabled' | 'marketingEnabled' | 'quietHoursEnabled'>;
type Props = { preferences: NotificationPreferences; loading: boolean; savingKey?: ToggleKey | null; onToggle: (key: ToggleKey, value: boolean) => void; };
type Item = { key: ToggleKey; title: string; description: string; icon: keyof typeof Ionicons.glyphMap };
type Group = { title: string; eyebrow: string; description: string; icon: keyof typeof Ionicons.glyphMap; tone: 'primary' | 'accent' | 'neutral'; items: Item[] };

const GROUPS: Group[] = [
  {
    title: 'الحركة المهمة',
    eyebrow: 'الحاجات اللي محتاجة رد منك',
    description: 'خليها شغالة لو عايز تعرف بسرعة لما يحصل شيء في عرض أو صفقة أو رسالة.',
    icon: 'flash-outline',
    tone: 'primary',
    items: [
      { key: 'offersEnabled', title: 'العروض', description: 'لما يجيلك عرض أو يحصل تحديث على عرض.', icon: 'swap-horizontal-outline' },
      { key: 'dealsEnabled', title: 'الصفقات', description: 'تنسيق الصفقة، التأكيدات، والحالات المهمة.', icon: 'hand-left-outline' },
      { key: 'messagesEnabled', title: 'الرسائل', description: 'رسائل المحادثات والصفقات اللي بتوصلك.', icon: 'chatbubbles-outline' },
    ],
  },
  {
    title: 'الناس والمجتمع',
    eyebrow: 'تفاعل حواليك',
    description: 'تنبيهات أخف مرتبطة بالمتابعات والقصص والتفاعل الاجتماعي.',
    icon: 'people-outline',
    tone: 'accent',
    items: [
      { key: 'socialEnabled', title: 'التفاعل الاجتماعي', description: 'متابعات، قصص، وتفاعلات مرتبطة بحسابك.', icon: 'person-add-outline' },
      { key: 'marketingEnabled', title: 'أخبار تِسوى', description: 'تحديثات عامة أو فرص مميزة من تِسوى.', icon: 'megaphone-outline' },
    ],
  },
  {
    title: 'الإيقاع الذكي',
    eyebrow: 'تِسوى يذكّرك من غير إزعاج',
    description: 'تحكم في التذكيرات الذكية وحدد لو عايزها تسكت وقت الراحة.',
    icon: 'sparkles-outline',
    tone: 'neutral',
    items: [
      { key: 'smartRemindersEnabled', title: 'تذكيرات ذكية', description: 'تذكيرات تساعدك تكمل عرض أو تنسيق متوقف.', icon: 'notifications-outline' },
      { key: 'quietHoursEnabled', title: 'وضع الهدوء', description: 'يوقف التذكيرات الذكية غير العاجلة أثناء وقت الراحة.', icon: 'moon-outline' },
    ],
  },
];

function palette(tone: Group['tone']) {
  if (tone === 'accent') return { surface: colors.accentSoft, color: colors.accent };
  if (tone === 'neutral') return { surface: '#EEE7DF', color: colors.textMuted };
  return { surface: colors.primarySoft, color: colors.primary };
}

export function NotificationPreferencesCard({ preferences, loading, savingKey, onToggle }: Props) {
  return (
    <View style={styles.wrap}>
      {GROUPS.map((group) => {
        const tone = palette(group.tone);
        return (
          <View key={group.title} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <View style={[styles.groupIcon, { backgroundColor: tone.surface }]}>
                <Ionicons name={group.icon} size={20} color={tone.color} />
              </View>
              <View style={styles.groupCopy}>
                <AppText muted style={styles.eyebrow}>{group.eyebrow}</AppText>
                <AppText weight="bold" style={styles.groupTitle}>{group.title}</AppText>
                <AppText muted style={styles.groupDescription}>{group.description}</AppText>
              </View>
            </View>

            <View style={styles.items}>
              {group.items.map((item, index) => {
                const enabled = preferences[item.key];
                const saving = savingKey === item.key;
                return (
                  <View key={item.key} style={[styles.row, index === group.items.length - 1 && styles.rowLast]}>
                    <View style={[styles.itemIcon, enabled && styles.itemIconEnabled]}>
                      <Ionicons name={item.icon} size={18} color={enabled ? colors.primary : colors.textMuted} />
                    </View>
                    <View style={styles.rowText}>
                      <View style={styles.rowTitleLine}>
                        <AppText weight="semibold" style={styles.rowTitle}>{item.title}</AppText>
                        {saving ? <AppText muted style={styles.savingText}>بأحفظ...</AppText> : null}
                      </View>
                      <AppText muted style={styles.description}>{item.description}</AppText>
                    </View>
                    <Switch
                      accessibilityLabel={item.title}
                      accessibilityHint={item.description}
                      value={enabled}
                      disabled={loading || Boolean(savingKey)}
                      onValueChange={(value) => onToggle(item.key, value)}
                      trackColor={{ false: colors.border, true: colors.primarySoft }}
                      thumbColor={enabled ? colors.primary : '#f4f3f4'}
                    />
                  </View>
                );
              })}
            </View>

            {group.items.some((item) => item.key === 'quietHoursEnabled') ? (
              <View style={styles.quietNote}>
                <Ionicons name="time-outline" size={17} color={colors.accent} />
                <AppText muted style={styles.quietText}>وقت الهدوء الحالي من {preferences.quietHoursStart} إلى {preferences.quietHoursEnd} حسب توقيت جهازك. التنبيهات المهمة المرتبطة بحركة حسابك لا تتوقف.</AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  groupCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: spacing.lg, backgroundColor: colors.surface, gap: spacing.md },
  groupHeader: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  groupIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  groupCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  eyebrow: { fontSize: 10 },
  groupTitle: { fontSize: 18, textAlign: 'right' },
  groupDescription: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  items: { borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.sm, minHeight: 72, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLast: { borderBottomWidth: 0 },
  itemIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  itemIconEnabled: { backgroundColor: colors.primarySoft },
  rowText: { flex: 1, gap: 2, alignItems: 'flex-end' },
  rowTitleLine: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { fontSize: 14 },
  savingText: { fontSize: 9 },
  description: { fontSize: 11, lineHeight: 17, textAlign: 'right' },
  quietNote: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.accentSoft },
  quietText: { flex: 1, fontSize: 10, lineHeight: 16, textAlign: 'right' },
});
