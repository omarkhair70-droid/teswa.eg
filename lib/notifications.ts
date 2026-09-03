import { teswaBackendRuntime } from '@/lib/backend/runtime';

export type NotificationType =
  | 'offer_received'
  | 'offer_thinking'
  | 'offer_accepted'
  | 'offer_soft_rejected'
  | 'offer_redirected'
  | 'deal_created'
  | 'deal_message_received'
  | 'deal_voice_message_received'
  | 'deal_completion_confirmation_needed'
  | 'deal_completed'
  | 'deal_cancelled'
  | 'story_reply_received'
  | 'contextual_message_received'
  | 'report_update'
  | 'system'
  | 'reminder_offer_response_needed'
  | 'reminder_deal_coordination_needed'
  | 'reminder_deal_confirmation_pending'
  | 'reminder_unread_deal_message'
  | 'reminder_unread_contextual_message'
  | 'nudge_listing_refresh_or_media'
  | 'digest_local_activity_pulse'
  | 'nudge_return_to_teswa'
  | 'user_followed_you'
  | 'direct_message_received';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  itemId: string | null;
  offerId: string | null;
  dealId: string | null;
  contextualConversationId: string | null;
  actorUserId: string | null;
  route: string | null;
  readAt: string | null;
  createdAt: string;
  isRead: boolean;
};

export type NotificationActionResult =
  | { ok: true }
  | { ok: false; message: string; error?: unknown };

const NOTIFICATION_ERROR_MESSAGE = 'تعذر تحميل الإشعارات حالياً. حاول مرة تانية.';
const NOTIFICATION_UPDATE_ERROR_MESSAGE = 'تعذر تحديث حالة الإشعار حالياً.';

function mapNotification(notification: Awaited<ReturnType<typeof teswaBackendRuntime.notifications.list>>[number]): AppNotification {
  return {
    id: notification.id,
    type: notification.type as NotificationType,
    title: notification.title,
    body: notification.body,
    itemId: notification.itemId,
    offerId: notification.offerId,
    dealId: notification.dealId,
    contextualConversationId: notification.conversationId,
    actorUserId: notification.actorUserId,
    route: notification.route,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    isRead: Boolean(notification.readAt),
  };
}

export async function fetchMyNotifications(
  userId: string,
): Promise<
  | { ok: true; data: AppNotification[] }
  | { ok: false; message: string; error?: unknown }
> {
  try {
    const data = await teswaBackendRuntime.notifications.list(userId, 50);
    return { ok: true, data: data.map(mapNotification) };
  } catch (error) {
    return { ok: false, message: NOTIFICATION_ERROR_MESSAGE, error };
  }
}

export async function fetchUnreadNotificationCount(
  userId: string,
): Promise<
  | { ok: true; count: number }
  | { ok: false; message: string; error?: unknown }
> {
  try {
    const count = await teswaBackendRuntime.notifications.getUnreadCount(userId);
    return { ok: true, count };
  } catch (error) {
    return { ok: false, message: NOTIFICATION_ERROR_MESSAGE, error };
  }
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<NotificationActionResult> {
  const result = await teswaBackendRuntime.notifications.markRead(userId, notificationId);
  return result.ok
    ? { ok: true }
    : { ok: false, message: NOTIFICATION_UPDATE_ERROR_MESSAGE, error: result.cause };
}

export async function markAllNotificationsRead(
  userId: string,
): Promise<NotificationActionResult> {
  const result = await teswaBackendRuntime.notifications.markAllRead(userId);
  return result.ok
    ? { ok: true }
    : { ok: false, message: NOTIFICATION_UPDATE_ERROR_MESSAGE, error: result.cause };
}

export function resolveNotificationRoute(
  notification: Pick<
    AppNotification,
    'type' | 'actorUserId' | 'contextualConversationId' | 'dealId' | 'offerId' | 'itemId' | 'route'
  >,
): string | null {
  if (notification.route?.startsWith('/direct/')) return notification.route;
  if (notification.type === 'user_followed_you' && notification.actorUserId) {
    return `/profile/${notification.actorUserId}`;
  }
  if (notification.contextualConversationId) {
    return `/contextual/${notification.contextualConversationId}`;
  }
  if (notification.dealId) return `/deal/${notification.dealId}`;
  if (notification.offerId) return `/offer/${notification.offerId}`;
  if (notification.itemId) return `/item/${notification.itemId}`;
  return null;
}

export const notificationTypeLabel: Record<NotificationType, string> = {
  offer_received: 'عرض جديد',
  offer_thinking: 'العرض قيد التفكير',
  offer_accepted: 'عرض مقبول',
  offer_soft_rejected: 'عرض غير مقبول',
  offer_redirected: 'عرض بديل',
  deal_created: 'صفقة جديدة',
  deal_message_received: 'رسالة صفقة',
  deal_voice_message_received: 'صوت في الصفقة',
  deal_completion_confirmation_needed: 'تأكيد الصفقة',
  deal_completed: 'مقايضة تمت',
  deal_cancelled: 'صفقة ملغاة',
  story_reply_received: 'رد على قصة',
  contextual_message_received: 'رسالة من قصة',
  report_update: 'تحديث بلاغ',
  system: 'تنبيه تِسوى',
  reminder_offer_response_needed: 'تذكير بالعرض',
  reminder_deal_coordination_needed: 'تذكير بالتنسيق',
  reminder_deal_confirmation_pending: 'تذكير بالتأكيد',
  reminder_unread_deal_message: 'رسالة صفقة غير مقروءة',
  reminder_unread_contextual_message: 'رد قصة غير مقروء',
  nudge_listing_refresh_or_media: 'تحسين العنصر',
  digest_local_activity_pulse: 'نشاط قريب منك',
  nudge_return_to_teswa: 'تحديث من تِسوى',
  user_followed_you: 'متابعة جديدة',
  direct_message_received: 'رسالة مباشرة',
};

