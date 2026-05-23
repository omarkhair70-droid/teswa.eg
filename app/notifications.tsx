import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { AppNotification, fetchMyNotifications, markAllNotificationsRead, markNotificationRead, notificationTypeLabel, resolveNotificationRoute } from '@/lib/notifications';
import { useUnreadBadges } from '@/lib/unread-badges';
import { trackEvent } from '@/lib/analytics';
import { queryKeys } from '@/lib/query/query-keys';

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const { refreshBadges } = useUnreadBadges();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications.byUserId(user?.id ?? 'anonymous'),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const result = await fetchMyNotifications(user!.id);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const markReadMutation = useMutation({
    mutationFn: async (notification: AppNotification) => {
      if (!user?.id) return { ok: false as const };
      return markNotificationRead(notification.id, user.id);
    },
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return { ok: false as const };
      return markAllNotificationsRead(user.id);
    },
  });

  const handleOpenNotification = async (notification: AppNotification) => {
    setDeepLinkError(null);
    const route = resolveNotificationRoute(notification);

    if (!notification.isRead && user) {
      try {
        const readResult = await markReadMutation.mutateAsync(notification);
        if ('ok' in readResult && readResult.ok) {
          queryClient.setQueryData<AppNotification[]>(queryKeys.notifications.byUserId(user.id), (prev = []) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
          void refreshBadges();
        } else if (__DEV__) {
          console.log('[ReactQuery]', 'notifications_mark_read_failed');
        }
      } catch (error) {
        if (__DEV__) {
          console.log('[ReactQuery]', 'notifications_mark_read_threw', {
            message: (error as { message?: string })?.message,
          });
        }
      }
    }

    if (route) {
      void trackEvent('notification_opened', { route: '/notifications', metadata: { notificationType: notification.type } });
      router.push(route);
    }
    else setDeepLinkError('تعذر فتح الإشعار لأن المحتوى لم يعد متاحًا. تقدر تكمّل من الرسائل أو الرئيسية.');
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    try {
      const result = await markAllMutation.mutateAsync();
      if ('ok' in result && result.ok) {
        const now = new Date().toISOString();
        void refreshBadges();
        queryClient.setQueryData<AppNotification[]>(queryKeys.notifications.byUserId(user.id), (prev = []) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: now })));
      } else if (__DEV__) {
        console.log('[ReactQuery]', 'notifications_mark_all_read_failed');
      }
    } catch (error) {
      if (__DEV__) {
        console.log('[ReactQuery]', 'notifications_mark_all_read_threw', {
          message: (error as { message?: string })?.message,
        });
      }
    }
  };

  if (!user) return <AppScreen><AppText>يجب تسجيل الدخول لعرض الإشعارات.</AppText></AppScreen>;

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <AppText weight="bold" style={styles.title}>الإشعارات</AppText>
        {unreadCount > 0 ? <AppButton label={markAllMutation.isPending ? 'جاري التنفيذ...' : 'تعليم الكل كمقروء'} onPress={handleMarkAllRead} disabled={markAllMutation.isPending} variant="neutral" /> : null}

        {notificationsQuery.isLoading ? <AppText muted>جاري تحميل الإشعارات...</AppText> : null}
        {deepLinkError ? (
          <AppCard>
            <View style={styles.group}>
              <AppText>{deepLinkError}</AppText>
              <View style={styles.rowBetween}>
                <AppButton label="الرسائل" onPress={() => router.replace('/(tabs)/messages')} variant="neutral" />
                <AppButton label="الرئيسية" onPress={() => router.replace('/(tabs)/home')} variant="neutral" />
              </View>
            </View>
          </AppCard>
        ) : null}
        {!notificationsQuery.isLoading && notificationsQuery.isError ? (
          <AppCard>
            <View style={styles.group}>
              <AppText>{notificationsQuery.error.message}</AppText>
              <AppButton label="إعادة المحاولة" onPress={() => void notificationsQuery.refetch()} variant="neutral" />
            </View>
          </AppCard>
        ) : null}

        {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 ? <AppText muted>لا توجد إشعارات حالياً.</AppText> : null}

        {!notificationsQuery.isLoading && !notificationsQuery.isError ? notifications.map((n) => {
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
          return <Pressable key={n.id} onPress={() => void handleOpenNotification(n)}>{card}</Pressable>;
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
