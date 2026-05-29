import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppInfoRow } from '@/components/ui/AppInfoRow';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import { AppNotification, fetchMyNotifications, markAllNotificationsRead, markNotificationRead, notificationTypeLabel, resolveNotificationRoute } from '@/lib/notifications';
import { useUnreadBadges } from '@/lib/unread-badges';
import { trackEvent } from '@/lib/analytics';
import { queryKeys } from '@/lib/query/query-keys';

type NotificationCenterSummaryProps = {
  totalCount: number;
  unreadCount: number;
  isRefreshing: boolean;
  canMarkAllRead: boolean;
  onRefresh: () => void;
  onMarkAllRead: () => void;
};

function NotificationCenterSummary({ totalCount, unreadCount, isRefreshing, canMarkAllRead, onRefresh, onMarkAllRead }: NotificationCenterSummaryProps) {
  const unreadValue = unreadCount > 99 ? '99+' : String(unreadCount);
  const totalValue = totalCount > 99 ? '99+' : String(totalCount);

  return (
    <AppCard>
      <View style={styles.group}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryCopy}>
            <AppText weight="semibold">مركز إشعارات تِسوى</AppText>
            <AppText muted style={styles.summaryDescription}>تابع الجديد وافتح المسار المناسب من مكان واحد.</AppText>
          </View>
          {unreadCount > 0 ? <AppText style={styles.newBadge}>{unreadValue} جديد</AppText> : <AppText muted style={styles.typeLabel}>كل شيء مقروء</AppText>}
        </View>

        <View style={styles.summaryRows}>
          <AppInfoRow label="غير مقروء" value={unreadValue} description="تنبيهات تحتاج انتباهك." />
          <AppInfoRow label="آخر القائمة" value={totalValue} description="آخر إشعارات محفوظة على حسابك." />
        </View>

        <View style={styles.rowBetween}>
          <AppButton label={isRefreshing ? 'جاري التحديث...' : 'تحديث'} onPress={onRefresh} disabled={isRefreshing} variant="neutral" />
          <AppButton label="تعليم الكل كمقروء" onPress={onMarkAllRead} disabled={!canMarkAllRead} variant="neutral" />
        </View>
      </View>
    </AppCard>
  );
}

function NotificationLoadingState() {
  return (
    <AppCard>
      <View style={styles.group}>
        <AppText weight="semibold">بنحمّل إشعاراتك...</AppText>
        <AppText muted>هنعرض الجديد هنا فور وصوله.</AppText>
        <View style={styles.skeletonLine} />
        <View style={styles.skeletonLineShort} />
      </View>
    </AppCard>
  );
}

function NotificationEmptyState() {
  return (
    <AppCard>
      <View style={styles.group}>
        <AppText weight="semibold">لا توجد إشعارات حالياً</AppText>
        <AppText muted>لما يحصل جديد في العروض، الرسائل، المتابعات، أو التذكيرات هيظهر هنا.</AppText>
        <AppButton label="العودة للرئيسية" variant="neutral" onPress={() => router.replace('/(tabs)/home')} />
      </View>
    </AppCard>
  );
}

function getNotificationRouteHint(notification: AppNotification, route: string | null) {
  if (route?.startsWith('/direct/')) return 'يفتح محادثة مباشرة';
  if (route?.startsWith('/deal/')) return 'يفتح دردشة الصفقة';
  if (route?.startsWith('/offer/')) return 'يفتح العرض';
  if (route?.startsWith('/item/')) return 'يفتح العنصر';
  if (route?.startsWith('/profile/')) return 'يفتح الملف الشخصي';
  if (route?.startsWith('/contextual/')) return 'يفتح محادثة القصة';
  if (notification.type === 'system' || notification.type === 'report_update') return 'تنبيه معلوماتي';
  return 'غير قابل للفتح حالياً';
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);
  const openingNotificationRef = useRef<string | null>(null);
  const openingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearOpeningNotificationSoon = (delayMs = 0) => {
    if (openingTimeoutRef.current) clearTimeout(openingTimeoutRef.current);
    openingTimeoutRef.current = setTimeout(() => {
      openingNotificationRef.current = null;
      setOpeningNotificationId(null);
    }, delayMs);
  };

  useEffect(() => () => {
    if (openingTimeoutRef.current) clearTimeout(openingTimeoutRef.current);
    openingNotificationRef.current = null;
  }, []);

  const handleOpenNotification = async (notification: AppNotification) => {
    if (openingNotificationRef.current) {
      if (__DEV__) console.log('[NotificationsNav] open_ignored_busy');
      return;
    }
    openingNotificationRef.current = notification.id;
    setOpeningNotificationId(notification.id);
    clearOpeningNotificationSoon(1200);

    setDeepLinkError(null);
    if (__DEV__) console.log('[NotificationsNav] open_start', { notificationType: notification.type });

    const route = resolveNotificationRoute(notification);
    if (!route) {
      if (__DEV__) console.log('[NotificationsNav] route_missing', { notificationType: notification.type });
      setDeepLinkError('تعذر فتح الإشعار لأن المحتوى لم يعد متاحًا. تقدر تكمّل من الرسائل أو الرئيسية.');
      clearOpeningNotificationSoon(300);
      return;
    }

    if (!notification.isRead && user) {
      const readAt = new Date().toISOString();
      queryClient.setQueryData<AppNotification[]>(queryKeys.notifications.byUserId(user.id), (prev = []) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true, readAt } : n)));
      void markReadMutation.mutateAsync(notification)
        .then((readResult) => {
          if ('ok' in readResult && readResult.ok) {
            void refreshBadges();
            return;
          }
          if (__DEV__) console.log('[NotificationsNav] mark_read_background_failed', { notificationType: notification.type });
        })
        .catch(() => {
          if (__DEV__) console.log('[NotificationsNav] mark_read_background_failed', { notificationType: notification.type });
        });
    }

    try {
      if (__DEV__) console.log('[NotificationsNav] route_push', { notificationType: notification.type });
      void trackEvent('notification_opened', { route: '/notifications', metadata: { notificationType: notification.type } });
      router.push(route);
    } catch (error) {
      if (__DEV__) {
        console.log('[NotificationsNav] route_push_failed', {
          notificationType: notification.type,
          message: (error as { message?: string })?.message,
        });
      }
      setDeepLinkError('تعذر فتح الإشعار لأن المحتوى لم يعد متاحًا. تقدر تكمّل من الرسائل أو الرئيسية.');
    } finally {
      clearOpeningNotificationSoon(500);
    }
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

  const handleRefresh = () => {
    setDeepLinkError(null);
    void notificationsQuery.refetch();
    void refreshBadges();
  };

  if (!user) return <AppScreen><AppText>يجب تسجيل الدخول لعرض الإشعارات.</AppText></AppScreen>;

  return (
    <AppScreen scrollable>
      <View style={styles.content}>
        <View style={styles.pageHeader}>
          <AppText weight="bold" style={styles.title}>الإشعارات</AppText>
          <AppText muted>تابع كل جديد في تِسوى وافتح المسار المناسب بسرعة.</AppText>
        </View>

        <NotificationCenterSummary
          totalCount={notifications.length}
          unreadCount={unreadCount}
          isRefreshing={notificationsQuery.isFetching || markAllMutation.isPending}
          canMarkAllRead={unreadCount > 0 && !markAllMutation.isPending}
          onRefresh={handleRefresh}
          onMarkAllRead={() => { void handleMarkAllRead(); }}
        />

        {notificationsQuery.isLoading ? <NotificationLoadingState /> : null}
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
              <AppText weight="semibold">تعذر تحميل الإشعارات</AppText>
              <AppText muted>{notificationsQuery.error.message}</AppText>
              <AppButton label="إعادة المحاولة" onPress={() => void notificationsQuery.refetch()} variant="neutral" />
            </View>
          </AppCard>
        ) : null}

        {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 ? <NotificationEmptyState /> : null}

        {!notificationsQuery.isLoading && !notificationsQuery.isError ? notifications.map((n) => {
          const route = resolveNotificationRoute(n);
          const isOpening = openingNotificationId === n.id;
          const routeHint = getNotificationRouteHint(n, route);
          const card = (
            <AppCard key={n.id}>
              <View style={styles.group}>
                <View style={styles.rowBetween}>
                  <AppText weight={n.isRead ? 'regular' : 'semibold'} style={styles.notificationTitle}>{n.title}</AppText>
                  {!n.isRead ? <AppText style={styles.newBadge}>جديد</AppText> : null}
                </View>
                <View style={styles.notificationMetaRow}>
                  <AppText muted style={styles.typeLabel}>{notificationTypeLabel[n.type]}</AppText>
                  <AppText muted style={styles.typeLabel}>{routeHint}</AppText>
                </View>
                {n.body ? <AppText>{n.body}</AppText> : null}
                <AppText muted>{new Date(n.createdAt).toLocaleString('ar-EG')}</AppText>
                {isOpening ? <AppText muted style={styles.typeLabel}>جاري فتح الإشعار...</AppText> : null}
              </View>
            </AppCard>
          );

          if (!route && n.isRead) return card;
          return (
            <Pressable key={n.id} onPress={() => void handleOpenNotification(n)} disabled={Boolean(openingNotificationId) || !route} style={isOpening ? styles.openingItem : undefined}>
              {card}
            </Pressable>
          );
        }) : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  pageHeader: { gap: spacing.xs },
  title: { fontSize: 24 },
  group: { gap: spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  summaryHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  summaryCopy: { flex: 1, gap: 2 },
  summaryDescription: { fontSize: 13 },
  summaryRows: { gap: spacing.xs },
  notificationTitle: { flex: 1 },
  notificationMetaRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  typeLabel: { fontSize: 12 },
  newBadge: { fontSize: 12, color: '#0A7D25' },
  openingItem: { opacity: 0.6 },
  skeletonLine: { height: 52, borderRadius: 12, backgroundColor: '#F3E7DB' },
  skeletonLineShort: { width: '66%', height: 14, borderRadius: 10, backgroundColor: '#F3E7DB' },
});