import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard';
import { fetchMyNotificationPreferences, NotificationPreferences, updateMyNotificationPreferences } from '@/lib/notification-preferences';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';

const FALLBACK: NotificationPreferences = { offersEnabled: true, dealsEnabled: true, messagesEnabled: true, socialEnabled: true, smartRemindersEnabled: true, marketingEnabled: false, quietHoursEnabled: false, quietHoursStart: '23:00', quietHoursEnd: '08:00', updatedAt: null };

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>(FALLBACK);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const result = await fetchMyNotificationPreferences();
      setPreferences(result.data);
      setError(result.ok ? null : result.message);
      setLoading(false);
    })();
  }, [user]);

  if (!user) return <AppScreen title="إعدادات الإشعارات"><AppText muted>سجّل الدخول للوصول لإعدادات الإشعارات.</AppText></AppScreen>;

  return <AppScreen title="إعدادات الإشعارات"><View style={styles.content}>{error ? <AppText muted>{error}</AppText> : null}<NotificationPreferencesCard preferences={preferences} loading={loading} savingKey={savingKey as any} onToggle={async (key, value) => {
    const previous = preferences;
    setSavingKey(key);
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setError(null);
    const result = await updateMyNotificationPreferences({ [key]: value });
    if (!result.ok) {
      setPreferences(previous);
      setError('تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى.');
    } else setPreferences(result.data);
    setSavingKey(null);
  }} /></View></AppScreen>;
}

const styles = StyleSheet.create({ content: { gap: spacing.sm, paddingBottom: spacing.xxl } });
