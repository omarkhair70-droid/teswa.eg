import { teswaBackendRuntime } from '@/lib/backend/runtime';

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

async function getCurrentUserId(): Promise<string | null> {
  try {
    return (await teswaBackendRuntime.auth.getSession())?.user.id ?? null;
  } catch {
    return null;
  }
}

async function syncDeviceTimezone() {
  const timezone = getDeviceTimezone();
  if (!timezone) return;
  const result = await teswaBackendRuntime.notifications.syncTimezone(timezone);
  if (!result.ok) warnDev('timezone_sync_failed', result.cause ?? result.message);
}

function mapPreferences(
  preferences: Awaited<ReturnType<typeof teswaBackendRuntime.notifications.getPreferences>>,
): NotificationPreferences {
  return {
    offersEnabled: preferences.offersEnabled,
    dealsEnabled: preferences.dealsEnabled,
    messagesEnabled: preferences.messagesEnabled,
    socialEnabled: preferences.socialEnabled,
    smartRemindersEnabled: preferences.smartRemindersEnabled,
    marketingEnabled: preferences.marketingEnabled,
    quietHoursEnabled: preferences.quietHoursEnabled,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
    updatedAt: preferences.updatedAt,
  };
}

export async function fetchMyNotificationPreferences(): Promise<
  | { ok: true; data: NotificationPreferences }
  | { ok: false; message: string; error?: unknown; data: NotificationPreferences }
> {
  await syncDeviceTimezone();
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      ok: false,
      message: 'تعذر تحميل إعدادات الإشعارات حالياً.',
      data: DEFAULT_PREFERENCES,
    };
  }

  try {
    const preferences = await teswaBackendRuntime.notifications.getPreferences(userId);
    return { ok: true, data: mapPreferences(preferences) };
  } catch (error) {
    warnDev('fetch_failed', error);
    return {
      ok: false,
      message: 'تعذر تحميل إعدادات الإشعارات حالياً.',
      error,
      data: DEFAULT_PREFERENCES,
    };
  }
}

export async function updateMyNotificationPreferences(
  patch: PreferencesPatch,
): Promise<
  | { ok: true; data: NotificationPreferences }
  | { ok: false; message: string; error?: unknown }
> {
  await syncDeviceTimezone();
  const userId = await getCurrentUserId();
  if (!userId) {
    return { ok: false, message: 'تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى.' };
  }

  const result = await teswaBackendRuntime.notifications.updatePreferences(userId, patch);
  if (!result.ok) {
    warnDev('update_failed', result.cause ?? result.message);
    return {
      ok: false,
      message: 'تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى.',
      error: result.cause,
    };
  }

  return { ok: true, data: mapPreferences(result.data) };
}
