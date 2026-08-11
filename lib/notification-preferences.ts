import { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

export type NotificationPreferences = {
  offersEnabled: boolean;
  dealsEnabled: boolean;
  messagesEnabled: boolean;
  socialEnabled: boolean;
  smartRemindersEnabled: boolean;
  marketingEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  updatedAt: string | null;
};

type PreferencesPatch = Partial<Omit<NotificationPreferences, 'updatedAt'>>;

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

function warnDev(scope: string, error: unknown) {
  if (__DEV__) console.warn(`[notification-preferences] ${scope}`, error);
}

function getDeviceTimezone(): string | null {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === 'string' && timezone.trim() ? timezone.trim() : null;
  } catch {
    return null;
  }
}

async function syncDeviceTimezone() {
  const timezone = getDeviceTimezone();
  if (!timezone) return;
  const { error } = await supabase.rpc('set_my_notification_timezone', { p_timezone: timezone });
  if (error) warnDev('timezone_sync_failed', error);
}

function mapRow(row: any): NotificationPreferences {
  return {
    offersEnabled: Boolean(row?.offers_enabled),
    dealsEnabled: Boolean(row?.deals_enabled),
    messagesEnabled: Boolean(row?.messages_enabled),
    socialEnabled: Boolean(row?.social_enabled),
    smartRemindersEnabled: Boolean(row?.smart_reminders_enabled),
    marketingEnabled: Boolean(row?.marketing_enabled),
    quietHoursEnabled: Boolean(row?.quiet_hours_enabled),
    quietHoursStart: typeof row?.quiet_hours_start === 'string' ? row.quiet_hours_start : DEFAULT_PREFERENCES.quietHoursStart,
    quietHoursEnd: typeof row?.quiet_hours_end === 'string' ? row.quiet_hours_end : DEFAULT_PREFERENCES.quietHoursEnd,
    updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function fetchMyNotificationPreferences(): Promise<{ ok: true; data: NotificationPreferences } | { ok: false; message: string; error?: PostgrestError | null; data: NotificationPreferences }> {
  await syncDeviceTimezone();
  const { data, error } = await supabase.rpc('get_my_notification_preferences');
  if (error) {
    warnDev('fetch_failed', error);
    return { ok: false, message: 'تعذر تحميل إعدادات الإشعارات حالياً.', error, data: DEFAULT_PREFERENCES };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapRow(row) };
}

export async function updateMyNotificationPreferences(patch: PreferencesPatch): Promise<{ ok: true; data: NotificationPreferences } | { ok: false; message: string; error?: PostgrestError | null }> {
  await syncDeviceTimezone();
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
    warnDev('update_failed', error);
    return { ok: false, message: 'تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى.', error };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: mapRow(row) };
}
