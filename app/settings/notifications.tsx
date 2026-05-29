import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { NotificationPermissionCard } from '@/components/settings/NotificationPermissionCard';
import { NotificationPreferencesCard } from '@/components/settings/NotificationPreferencesCard';
import {
  fetchMyNotificationPreferences,
  NotificationPreferences,
  updateMyNotificationPreferences,
} from '@/lib/notification-preferences';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';

type NotificationToggleKey =
  | 'offersEnabled'
  | 'dealsEnabled'
  | 'messagesEnabled'
  | 'socialEnabled'
  | 'smartRemindersEnabled'
  | 'marketingEnabled'
  | 'quietHoursEnabled';

const FALLBACK: NotificationPreferences = {
  offersEnabled: true,
  dealsEnabled: true,
  messagesEnabled: true,
  socialEnabled: true,
  smartRemindersEnabled: true,
  marketingEnabled: false,
  quietHoursEnabled: false,
  quietHoursStart: '23:00',
  quietHoursEnd: '08:00',
  updatedAt: null,
};

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>(FALLBACK);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<NotificationToggleKey | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await fetchMyNotificationPreferences();

      if (cancelled) return;

      setPreferences(result.data);
      setError(result.ok ? null : result.message);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleToggle = async (key: NotificationToggleKey, value: boolean) => {
    const previous = preferences;

    setSavingKey(key);
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setError(null);

    const result = await updateMyNotificationPreferences({ [key]: value });

    if (!result.ok) {
      setPreferences(previous);
      setError('تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى.');
    } else {
      setPreferences(result.data);
    }

    setSavingKey(null);
  };

  if (!user) {
    return (
      <AppScreen>
        <View style={styles.content}>
          <AppText weight="bold" style={styles.title}>
            إعدادات الإشعارات
          </AppText>
          <AppText muted>سجّل الدخول للوصول لإعدادات الإشعارات.</AppText>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>
          إعدادات الإشعارات
        </AppText>

        <NotificationPermissionCard />

        {error ? <AppText muted>{error}</AppText> : null}

        <NotificationPreferencesCard
          preferences={preferences}
          loading={loading}
          savingKey={savingKey}
          onToggle={handleToggle}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: 22,
  },
});