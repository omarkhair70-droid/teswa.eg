import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppScreen } from '@/components/ui/AppScreen';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { colors } from '@/constants/colors';
import { radii } from '@/constants/radii';
import { spacing } from '@/constants/spacing';
import { useAuth } from '@/lib/auth';
import {
  AppNotification,
  fetchMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTypeLabel,
  resolveNotificationRoute,
  type NotificationType,
} from '@/lib/notifications';
import { useUnreadBadges } from '@/lib/unread-badges';
import { trackEvent } from '@/lib/analytics';
import { queryKeys } from '@/lib/query/query-keys';

type Tone = 'primary' | 'accent' | 'success' | 'danger' | 'neutral';
type NotificationVisual = { icon: keyof typeof Ionicons.glyphMap; tone: Tone };

const tonePalette: Record<Tone, { surface: string; color: string }> = {
  primary: { surface: colors.primarySoft, color: colors.primary },
  accent: { surface: colors.accentSoft, color: colors.accent },
  success: { surface: colors.successSoft, color: colors.success },
  danger: { surface: colors.dangerSoft, color: colors.danger },
  neutral: { surface: '#EEE7DF', color: colors.textMuted },
};

function getVisual(type: NotificationType): NotificationVisual {
  if (type === 'direct_message_received' || type === 'contextual_message_received' || type === 'story_reply_received') return { icon: 'chatbubble-ellipses-outline', tone: 'primary' };
  if (type === 'deal_message_received' || type === 'deal_voice_message_received' || type === 'reminder_unread_deal_message') return { icon: 'chatbubbles-outline', tone: 'primary' };
  if (type === 'offer_received' || type === 'offer_thinking' || type === 'offer_redirected' || type === 'reminder_offer_response_needed') return { icon: 'swap-horizontal-outline', tone: 'accent' };
  if (type === 'offer_accepted' || type === 'deal_completed') return { icon: 'checkmark-circle-outline', tone: 'success' };
  if (type === 'offer_soft_rejected' || type === 'deal_cancelled') return { icon: 'close-circle-outline', tone: 'danger' };
  if (type.startsWith('deal_') || type.startsWith('reminder_deal_')) return { icon: 'hand-left-outline', tone: 'accent' };
  if (type === 'user_followed_you') return { icon: 'person-add-outline', tone: 'primary' };
  if (type === 'report_update') return { icon: 'shield-checkmark-outline', tone: 'accent' };
  if (type === 'nudge_listing_refresh_or_media') return { icon: 'sparkles-outline', tone: 'accent' };
  if (type.startsWith('reminder_') || type.startsWith('nudge_') || type.startsWith('digest_')) return { icon: 'notifications-outline', tone: 'neutral' };
  return { icon: 'information-circle-outline', tone: 'neutral' };
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

function getRouteHint(notification: AppNotification, route: string | null) {
  if (route?.startsWith('/direct/')) return 'محادثة مباشرة';
  if (route?.startsWith('/deal/')) return 'الصفقة';
  if (route?.startsWith('/offer/')) return 'العرض';
  if (route?.startsWith('/item/')) return 'العنصر';
  if (route?.startsWith('/profile/')) return 'الملف الشخصي';
  if (route?.startsWith('/contextual/')) return 'محادثة القصة';
  if (notification.type === 'system' || notification.type === 'report_update') return 'معلومات';
  return null;
}

function EmptyState() {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Ionicons name="notifications-off-outline" size={28} color={colors.accent} /></View>
      <AppText weight="bold" style={styles.emptyTitle}>مفيش حاجة جديدة دلوقتي</AppText>
      <AppText muted style={styles.emptyText}>العروض والرسائل والمتابعات وتحديثات الصفقات هتظهر هنا أول ما تحصل.</AppText>
      <AppButton label="الرجوع للرئيسية" variant="neutral" onPress={() => router.replace('/(tabs)/home')} />
    </View>
  );
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
    if (openingNotificationRef.current) return;
    openingNotificationRef.current = notification.id;
    setOpeningNotificationId(notification.id);
    clearOpeningNotificationSoon(1200);
    setDeepLinkError(null);

    const route = resolveNotificationRoute(notification);
    if (!route) {
      setDeepLinkError('المحتوى المرتبط بالإشعار مش متاح دلوقتي. تقدر تكمل من الرسائل أو الرئيسية.');
      clearOpeningNotificationSoon(300);
      return;
    }

    if (!notification.isRead && user) {
      const readAt = new Date().toISOString();
      queryClient.setQueryData<AppNotification[]>(queryKeys.notifications.byUserId(user.id), (prev = []) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true, readAt } : n)));
      void markReadMutation.mutateAsync(notification).then((readResult) => {
        if ('ok' in readResult && readResult.ok) void refreshBadges();
      }).catch(() => undefined);
    }

    try {
      void trackEvent('notification_opened', { route: '/notifications', metadata: { notificationType: notification.type } });
      router.push(route);
    } catch {
      setDeepLinkError('تعذر فتح الإشعار. جرّب الوصول للمحتوى من الرسائل أو الرئيسية.');
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
      }
    } catch {
      // Keep the current list state if the server update fails.
    }
  };

  const handleRefresh = () => {
    setDeepLinkError(null);
    void notificationsQuery.refetch();
    void refreshBadges();
  };

  if (!user) {
    return <AppScreen backgroundVariant="soft"><View style={styles.signedOut}><Ionicons name="log-in-outline" size={26} color={colors.primary} /><AppText weight="bold">سجّل الدخول عشان تشوف إشعاراتك</AppText></View></AppScreen>;
  }

  return (
    <AppScreen scrollable backgroundVariant="alive">
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="notifications-outline" size={23} color={colors.primary} /></View>
        <View style={styles.heroCopy}>
          <AppText muted style={styles.eyebrow}>كل اللي محتاج انتباهك</AppText>
          <AppText weight="bold" style={styles.title}>الإشعارات</AppText>
          <AppText muted style={styles.heroDescription}>افتَح العرض أو الرسالة أو الصفقة من نفس التنبيه بدل ما تدور عليها.</AppText>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.unreadBubble}>
            <AppText weight="bold" style={styles.unreadValue}>{unreadCount > 99 ? '99+' : unreadCount}</AppText>
            <AppText muted style={styles.unreadLabel}>غير مقروء</AppText>
          </View>
          <View style={styles.summaryCopy}>
            <AppText weight="bold" style={styles.summaryTitle}>{unreadCount > 0 ? 'في جديد مستنيك' : 'أنت متابع كل حاجة'}</AppText>
            <AppText muted style={styles.summaryText}>{notifications.length ? `آخر ${notifications.length} إشعار محفوظ على حسابك.` : 'أول نشاط جديد هيظهر هنا.'}</AppText>
          </View>
        </View>
        <View style={styles.summaryActions}>
          <Pressable accessibilityRole="button" onPress={handleRefresh} disabled={notificationsQuery.isFetching} style={styles.actionPill}>
            <Ionicons name="refresh-outline" size={16} color={colors.text} />
            <AppText style={styles.actionText}>{notificationsQuery.isFetching ? 'بحدّث...' : 'تحديث'}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void handleMarkAllRead()} disabled={unreadCount === 0 || markAllMutation.isPending} style={[styles.actionPill, (unreadCount === 0 || markAllMutation.isPending) && styles.actionDisabled]}>
            <Ionicons name="checkmark-done-outline" size={16} color={colors.text} />
            <AppText style={styles.actionText}>اعتبر الكل مقروء</AppText>
          </Pressable>
        </View>
      </View>

      {deepLinkError ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <View style={styles.errorCopy}>
            <AppText weight="semibold" style={styles.errorTitle}>المسار مش متاح</AppText>
            <AppText style={styles.errorText}>{deepLinkError}</AppText>
          </View>
        </View>
      ) : null}

      {notificationsQuery.isLoading ? (
        <View style={styles.listPanel}>
          <View style={styles.listHeader}><AppText weight="bold">بنحمّل الجديد...</AppText></View>
          {[0, 1, 2].map((key) => <View key={key} style={styles.skeletonRow}><View style={styles.skeletonIcon} /><View style={styles.skeletonCopy}><View style={styles.skeletonTitle} /><View style={styles.skeletonLine} /></View></View>)}
        </View>
      ) : null}

      {!notificationsQuery.isLoading && notificationsQuery.isError ? (
        <View style={styles.emptyCard}>
          <View style={[styles.emptyIcon, styles.errorEmptyIcon]}><Ionicons name="cloud-offline-outline" size={28} color={colors.danger} /></View>
          <AppText weight="bold" style={styles.emptyTitle}>تعذر تحميل الإشعارات</AppText>
          <AppText muted style={styles.emptyText}>{notificationsQuery.error.message}</AppText>
          <AppButton label="إعادة المحاولة" onPress={() => void notificationsQuery.refetch()} variant="neutral" />
        </View>
      ) : null}

      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length === 0 ? <EmptyState /> : null}

      {!notificationsQuery.isLoading && !notificationsQuery.isError && notifications.length > 0 ? (
        <View style={styles.listPanel}>
          <View style={styles.listHeader}>
            <View style={styles.listHeaderIcon}><Ionicons name="time-outline" size={18} color={colors.primary} /></View>
            <View style={styles.listHeaderCopy}>
              <AppText muted style={styles.eyebrow}>الأحدث أولًا</AppText>
              <AppText weight="bold" style={styles.listTitle}>نشاطك الأخير</AppText>
            </View>
          </View>

          <View style={styles.rows}>
            {notifications.map((notification, index) => {
              const route = resolveNotificationRoute(notification);
              const visual = getVisual(notification.type);
              const palette = tonePalette[visual.tone];
              const routeHint = getRouteHint(notification, route);
              const isOpening = openingNotificationId === notification.id;
              const interactive = Boolean(route);

              return (
                <Pressable
                  key={notification.id}
                  accessibilityRole={interactive ? 'button' : undefined}
                  disabled={!interactive || Boolean(openingNotificationId)}
                  onPress={() => void handleOpenNotification(notification)}
                  style={({ pressed }) => [styles.notificationRow, index === notifications.length - 1 && styles.notificationRowLast, !notification.isRead && styles.notificationUnread, isOpening && styles.openingItem, pressed && interactive && styles.rowPressed]}
                >
                  <View style={[styles.notificationIcon, { backgroundColor: palette.surface }]}>
                    <Ionicons name={visual.icon} size={21} color={palette.color} />
                    {!notification.isRead ? <View style={styles.unreadDot} /> : null}
                  </View>

                  <View style={styles.notificationCopy}>
                    <View style={styles.notificationTopLine}>
                      <AppText weight={notification.isRead ? 'semibold' : 'bold'} style={styles.notificationTitle}>{notification.title}</AppText>
                      <AppText muted style={styles.timeText}>{formatWhen(notification.createdAt)}</AppText>
                    </View>
                    {notification.body ? <AppText muted style={styles.notificationBody} numberOfLines={3}>{notification.body}</AppText> : null}
                    <View style={styles.metaRow}>
                      <View style={styles.typePill}><AppText style={styles.typeText}>{notificationTypeLabel[notification.type]}</AppText></View>
                      {routeHint ? <AppText muted style={styles.routeHint}>{isOpening ? 'جاري الفتح...' : routeHint}</AppText> : null}
                    </View>
                  </View>

                  {interactive ? <Ionicons name="chevron-back" size={17} color={colors.textMuted} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  signedOut: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  hero: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.md },
  heroIcon: { width: 48, height: 48, borderRadius: radii.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, alignItems: 'flex-end', gap: 3 },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 29, lineHeight: 36, textAlign: 'right' },
  heroDescription: { textAlign: 'right', lineHeight: 21 },
  summaryCard: { padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  summaryTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.lg },
  unreadBubble: { width: 82, minHeight: 82, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  unreadValue: { fontSize: 25, color: colors.primary },
  unreadLabel: { fontSize: 11 },
  summaryCopy: { flex: 1, alignItems: 'flex-end', gap: 4 },
  summaryTitle: { fontSize: 18, textAlign: 'right' },
  summaryText: { lineHeight: 20, textAlign: 'right' },
  summaryActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm },
  actionPill: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radii.round, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  actionText: { fontSize: 12 },
  actionDisabled: { opacity: 0.45 },
  errorCard: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.dangerSoft },
  errorCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  errorTitle: { color: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  emptyCard: { padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: spacing.md },
  emptyIcon: { width: 58, height: 58, borderRadius: radii.round, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  errorEmptyIcon: { backgroundColor: colors.dangerSoft },
  emptyTitle: { fontSize: 19, textAlign: 'center' },
  emptyText: { textAlign: 'center', lineHeight: 21 },
  listPanel: { borderRadius: radii.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  listHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  listHeaderIcon: { width: 38, height: 38, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  listHeaderCopy: { flex: 1, alignItems: 'flex-end', gap: 2 },
  listTitle: { fontSize: 17 },
  rows: { backgroundColor: colors.surface },
  notificationRow: { minHeight: 88, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  notificationRowLast: { borderBottomWidth: 0 },
  notificationUnread: { backgroundColor: '#FFF9F4' },
  notificationIcon: { width: 46, height: 46, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: radii.round, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.surface },
  notificationCopy: { flex: 1, alignItems: 'flex-end', gap: 4 },
  notificationTopLine: { width: '100%', flexDirection: 'row-reverse', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  notificationTitle: { flex: 1, textAlign: 'right', fontSize: 15 },
  timeText: { fontSize: 10 },
  notificationBody: { width: '100%', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  metaRow: { width: '100%', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.round, backgroundColor: colors.background },
  typeText: { fontSize: 10, color: colors.textMuted },
  routeHint: { fontSize: 10 },
  openingItem: { opacity: 0.58 },
  rowPressed: { opacity: 0.72 },
  skeletonRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  skeletonIcon: { width: 46, height: 46, borderRadius: radii.lg, backgroundColor: '#F3E7DB' },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonTitle: { width: '70%', height: 14, borderRadius: 8, backgroundColor: '#F3E7DB' },
  skeletonLine: { width: '92%', height: 11, borderRadius: 8, backgroundColor: '#F3E7DB' },
});
