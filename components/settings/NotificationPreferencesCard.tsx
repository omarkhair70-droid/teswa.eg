import { StyleSheet, Switch, View } from 'react-native';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import type { NotificationPreferences } from '@/lib/notification-preferences';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

type ToggleKey = keyof Pick<NotificationPreferences, 'offersEnabled' | 'dealsEnabled' | 'messagesEnabled' | 'socialEnabled' | 'smartRemindersEnabled' | 'marketingEnabled' | 'quietHoursEnabled'>;
type Props = { preferences: NotificationPreferences; loading: boolean; savingKey?: ToggleKey | null; onToggle: (key: ToggleKey, value: boolean) => void; };
const ITEMS: Array<{ key: ToggleKey; title: string; description: string }> = [
  { key: 'offersEnabled', title: 'العروض', description: 'تنبيهات لما يجيلك عرض أو يحصل تحديث على عرض.' },
  { key: 'dealsEnabled', title: 'الصفقات', description: 'تنبيهات تنسيق الصفقة، الرسائل، وتأكيد الإتمام.' },
  { key: 'messagesEnabled', title: 'الرسائل', description: 'تنبيهات رسائل المحادثات والصفقات.' },
  { key: 'socialEnabled', title: 'التفاعل الاجتماعي', description: 'تنبيهات المتابعات والقصص والتفاعل.' },
  { key: 'smartRemindersEnabled', title: 'تذكيرات ذكية', description: 'تذكيرات هادئة تساعدك تكمل فرصة تبديل أو صفقة.' },
  { key: 'marketingEnabled', title: 'أخبار تِسوى', description: 'تحديثات عامة أو فرص مميزة من تِسوى.' },
  { key: 'quietHoursEnabled', title: 'وضع الهدوء', description: 'يوقف التذكيرات الذكية غير العاجلة أثناء وقت الراحة.' },
];
export function NotificationPreferencesCard({ preferences, loading, savingKey, onToggle }: Props) {
  return <AppCard><View style={styles.header}><AppText weight="semibold">إعدادات الإشعارات</AppText></View>{ITEMS.map((item) => <View key={item.key} style={styles.row}><View style={styles.rowText}><AppText weight="semibold">{item.title}</AppText><AppText muted style={styles.description}>{item.description}</AppText></View><Switch accessibilityLabel={item.title} accessibilityHint={item.description} value={preferences[item.key]} disabled={loading || savingKey === item.key} onValueChange={(value) => onToggle(item.key, value)} trackColor={{ false: colors.border, true: colors.primarySoft }} thumbColor={preferences[item.key] ? colors.primary : '#f4f3f4'} /></View>)}<AppText muted style={styles.note}>وضع الهدوء يعمل من {preferences.quietHoursStart} إلى {preferences.quietHoursEnd} حسب توقيت جهازك. التنبيهات المهمة المرتبطة بحركة حسابك لا تتوقف.</AppText></AppCard>;
}
const styles = StyleSheet.create({ header: { marginBottom: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }, rowText: { flex: 1, gap: 2 }, description: { fontSize: 13 }, note: { marginTop: spacing.sm, fontSize: 12 } });
