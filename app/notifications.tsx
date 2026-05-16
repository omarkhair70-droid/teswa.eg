import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { AppNotification, fetchMyNotifications, markAllNotificationsRead, markNotificationRead, notificationTypeLabel, resolveNotificationRoute } from '@/lib/notifications';
import { useUnreadBadges } from '@/lib/unread-badges';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const { refreshBadges } = useUnreadBadges();

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const result = await fetchMyNotifications(user.id);
    if (!result.ok) {
      setError(result.message);
      setLoading(false);
      return;
    }
    setNotifs(result.data);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.isRead).length, [notifs]);

  const handleOpenNotification = async (notification: AppNotification) => {
    const route = resolveNotificationRoute(notification);
    if (!notification.isRead && user) {
      try {
        const readResult = await markNotificationRead(notification.id, user.id);
        if (readResult.ok) {
          setNotifs((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
          void refreshBadges();
        } else if (__DEV__) {
          console.log('[Notifications] mark read failed', readResult.error);
        }
      } catch (err) {
        if (__DEV__) console.log('[Notifications] mark read threw', { notificationId: notification.id, code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
      }
    }

    if (route) router.push(route);
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    try {
      const result = await markAllNotificationsRead(user.id);
      if (result.ok) {
        const now = new Date().toISOString();
        void refreshBadges();
        setNotifs((prev) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: now })));
      } else if (__DEV__) {
        console.log('[Notifications] mark all read failed', result.error);
      }
    } catch (err) {
      if (__DEV__) console.log('[Notifications] mark all read threw', { code: (err as { code?: string })?.code, message: (err as { message?: string })?.message });
    } finally {
      setMarkingAll(false);
    }
  };

  if (!user) return <AppScreen><AppText>يجب تسجيل الدخول لعرض الإشعارات.</AppText></AppScreen>;

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>الإشعارات</AppText>
        {unreadCount > 0 ? <AppButton label={markingAll ? 'جاري التنفيذ...' : 'تعليم الكل كمقروء'} onPress={handleMarkAllRead} disabled={markingAll} variant="neutral" /> : null}

        {loading ? <AppText muted>جاري تحميل الإشعارات...</AppText> : null}
        {!loading && error ? (
          <AppCard>
            <View style={styles.group}>
              <AppText>{error}</AppText>
              <AppButton label="إعادة المحاولة" onPress={loadNotifications} variant="neutral" />
            </View>
          </AppCard>
        ) : null}

        {!loading && !error && notifs.length === 0 ? <AppText muted>لا توجد إشعارات حالياً.</AppText> : null}

        {!loading && !error ? notifs.map((n) => {
          const route = resolveNotificationRoute(n);
          const card = (
            <AppCard key={n.id}>
              <View style={styles.group}>
                <View style={styles.rowBetween}>
                  <AppText weight={n.isRead ? 'regular' : 'semibold'}>{n.title}</AppText>
                  {!n.isRead ? <AppText style={styles.newBadge}>جديد</AppText> : null}
                </View>
                <AppText muted style={styles.typeLabel}>{notificationTypeLabel[n.type]}</AppText>
                {n.body ? <AppText>{n.body}</AppText> : null}
                <AppText muted>{new Date(n.createdAt).toLocaleString('ar-EG')}</AppText>
              </View>
            </AppCard>
          );

          if (!route && n.isRead) return card;
          return <Pressable key={n.id} onPress={() => handleOpenNotification(n)}>{card}</Pressable>;
        }) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  title: { fontSize: 24 },
  group: { gap: spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  typeLabel: { fontSize: 12 },
  newBadge: { fontSize: 12, color: '#0A7D25' },
});
