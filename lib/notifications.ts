import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

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
  | 'system';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  itemId: string | null;
  offerId: string | null;
  dealId: string | null;
  contextualConversationId: string | null;
  readAt: string | null;
  createdAt: string;
  isRead: boolean;
};

export type NotificationActionResult =
  | { ok: true }
  | { ok: false; message: string; error?: PostgrestError | null };

const NOTIFICATION_ERROR_MESSAGE = 'تعذر تحميل الإشعارات حالياً. حاول مرة تانية.';
const NOTIFICATION_UPDATE_ERROR_MESSAGE = 'تعذر تحديث حالة الإشعار حالياً.';

function mapNotificationRow(row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  item_id: string | null;
  offer_id: string | null;
  deal_id: string | null;
  contextual_conversation_id: string | null;
  read_at: string | null;
  created_at: string;
}): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    itemId: row.item_id,
    offerId: row.offer_id,
    dealId: row.deal_id,
    contextualConversationId: row.contextual_conversation_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    isRead: Boolean(row.read_at),
  };
}

export async function fetchMyNotifications(userId: string): Promise<{ ok: true; data: AppNotification[] } | { ok: false; message: string; error?: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, item_id, offer_id, deal_id, contextual_conversation_id, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { ok: false, message: NOTIFICATION_ERROR_MESSAGE, error };
  return { ok: true, data: (data ?? []).map(mapNotificationRow) };
}

export async function fetchUnreadNotificationCount(userId: string): Promise<{ ok: true; count: number } | { ok: false; message: string; error?: PostgrestError | null }> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) return { ok: false, message: NOTIFICATION_ERROR_MESSAGE, error };
  return { ok: true, count: count ?? 0 };
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<NotificationActionResult> {
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: readAt })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) return { ok: false, message: NOTIFICATION_UPDATE_ERROR_MESSAGE, error };
  return { ok: true };
}

export async function markAllNotificationsRead(userId: string): Promise<NotificationActionResult> {
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: readAt })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) return { ok: false, message: NOTIFICATION_UPDATE_ERROR_MESSAGE, error };
  return { ok: true };
}

export function resolveNotificationRoute(notification: Pick<AppNotification, 'contextualConversationId' | 'dealId' | 'offerId' | 'itemId'>): string | null {
  if (notification.contextualConversationId) return `/contextual/${notification.contextualConversationId}`;
  if (notification.dealId) return `/deal/${notification.dealId}`;
  if (notification.offerId) return `/offer/${notification.offerId}`;
  if (notification.itemId) return `/item/${notification.itemId}`;
  return null;
}

export const notificationTypeLabel: Record<NotificationType, string> = {
  offer_received: 'عرض جديد',
  offer_thinking: 'بيفكر في العرض',
  offer_accepted: 'العرض اتقبل',
  offer_soft_rejected: 'لم يتم قبول العرض',
  offer_redirected: 'عرض بديل',
  deal_created: 'صفقة جديدة',
  deal_message_received: 'رسالة جديدة في الصفقة',
  deal_voice_message_received: 'رسالة صوتية في الصفقة',
  deal_completion_confirmation_needed: 'الصفقة مستنية تأكيدك',
  deal_completed: 'المقايضة تمت',
  deal_cancelled: 'الصفقة اتلغت',
  story_reply_received: 'رد جديد على القصة',
  contextual_message_received: 'رسالة جديدة في محادثة القصة',
  report_update: 'تحديث بلاغ',
  system: 'تنبيه',
};
