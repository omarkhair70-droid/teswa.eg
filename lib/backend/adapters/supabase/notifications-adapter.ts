import type {
  NotificationDispatchInput,
  NotificationPreferences,
  NotificationsContract,
  TeswaNotification,
} from '@/lib/backend/contracts/notifications';
import { supabase } from '@/lib/supabase/client';

function mapNotification(row: any): TeswaNotification {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    route: (row.route as string | null) ?? null,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    itemId: (row.item_id as string | null) ?? null,
    offerId: (row.offer_id as string | null) ?? null,
    dealId: (row.deal_id as string | null) ?? null,
    conversationId: (row.contextual_conversation_id as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
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

function mapPreferences(row: any): NotificationPreferences {
  return {
    offersEnabled: Boolean(row?.offers_enabled),
    dealsEnabled: Boolean(row?.deals_enabled),
    messagesEnabled: Boolean(row?.messages_enabled),
    socialEnabled: Boolean(row?.social_enabled),
    smartRemindersEnabled: Boolean(row?.smart_reminders_enabled),
    marketingEnabled: Boolean(row?.marketing_enabled),
    quietHoursEnabled: Boolean(row?.quiet_hours_enabled),
    quietHoursStart:
      typeof row?.quiet_hours_start === 'string'
        ? row.quiet_hours_start
        : DEFAULT_PREFERENCES.quietHoursStart,
    quietHoursEnd:
      typeof row?.quiet_hours_end === 'string'
        ? row.quiet_hours_end
        : DEFAULT_PREFERENCES.quietHoursEnd,
    updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null,
  };
}

function buildDispatchPayload(input: NotificationDispatchInput) {
  return {
    target_user_id: input.targetUserId,
    notification_type: input.type,
    notification_title: input.title,
    notification_body: input.body ?? null,
    target_item_id: input.itemId ?? null,
    target_offer_id: input.offerId ?? null,
    target_deal_id: input.dealId ?? null,
    target_message_id: input.messageId ?? null,
  };
}

export function createSupabaseNotificationsAdapter(): NotificationsContract {
  return {
    async list(userId, limit = 50) {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          'id, type, title, body, item_id, offer_id, deal_id, contextual_conversation_id, actor_user_id, route, read_at, created_at',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapNotification);
    },

    async getUnreadCount(userId) {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);

      if (error) throw error;
      return count ?? 0;
    },

    async markRead(userId, notificationId) {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .is('read_at', null);

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },

    async markAllRead(userId) {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },

    async getPreferences(_userId) {
      const { data, error } = await supabase.rpc('get_my_notification_preferences');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ? mapPreferences(row) : DEFAULT_PREFERENCES;
    },

    async updatePreferences(_userId, patch) {
      const { data, error } = await supabase.rpc('update_my_notification_preferences', {
        p_offers_enabled: patch.offersEnabled,
        p_deals_enabled: patch.dealsEnabled,
        p_messages_enabled: patch.messagesEnabled,
        p_social_enabled: patch.socialEnabled,
        p_smart_reminders_enabled: patch.smartRemindersEnabled,
        p_marketing_enabled: patch.marketingEnabled,
        p_quiet_hours_enabled: patch.quietHoursEnabled,
        p_quiet_hours_start: patch.quietHoursStart,
        p_quiet_hours_end: patch.quietHoursEnd,
      });

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }

      const row = Array.isArray(data) ? data[0] : data;
      return { ok: true, data: row ? mapPreferences(row) : DEFAULT_PREFERENCES };
    },

    async syncTimezone(timezone) {
      const normalized = timezone.trim();
      if (!normalized) {
        return { ok: false, reason: 'validation', message: 'Timezone is required.' };
      }

      const { error } = await supabase.rpc('set_my_notification_timezone', {
        p_timezone: normalized,
      });

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },

    async registerPushDevice(input) {
      const { error } = await supabase.rpc('register_push_device', {
        p_expo_push_token: input.expoPushToken,
        p_platform: input.platform,
      });

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },

    async disablePushDevice(input) {
      const { data, error } = await supabase.rpc('disable_my_push_device', {
        p_expo_push_token: input.expoPushToken,
      });

      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      if (data === false) {
        return { ok: false, reason: 'unknown', message: 'Push device was not disabled.' };
      }
      return { ok: true, data: undefined };
    },

    async dispatch(input) {
      const { error } = await supabase.rpc('create_notification', buildDispatchPayload(input));
      if (error) {
        return { ok: false, reason: 'unknown', message: error.message, cause: error };
      }
      return { ok: true, data: undefined };
    },
  };
}
