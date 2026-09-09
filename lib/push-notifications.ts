import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { teswaBackendRuntime } from '@/lib/backend/runtime';

const PUSH_TOKEN_KEY = 'teswa.push.expo_token';
const ANDROID_CHANNEL_ID = 'teswa-activity';

export type PushPermissionStatus = 'granted' | 'denied' | 'can_ask_again' | 'unsupported';

export type PushRegistrationResult =
  | { ok: true; expoPushToken: string }
  | { ok: false; message: string; reason?: 'permission_denied' | 'unsupported' | 'missing_project_id' | 'unknown' };

export type PushPermissionSnapshot = {
  status: PushPermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
  hasStoredToken: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Teswa activity',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function getNotificationPermissionSnapshot(): Promise<PushPermissionSnapshot> {
  if (Platform.OS === 'web') {
    return { status: 'unsupported', granted: false, canAskAgain: false, hasStoredToken: false };
  }

  const [settings, hasStoredTokenValue] = await Promise.all([
    Notifications.getPermissionsAsync(),
    hasStoredPushToken(),
  ]);

  const status: PushPermissionStatus = settings.granted ? 'granted' : settings.canAskAgain ? 'can_ask_again' : 'denied';

  return {
    status,
    granted: settings.granted,
    canAskAgain: settings.canAskAgain,
    hasStoredToken: hasStoredTokenValue,
  };
}

export async function getNotificationPermissionStatus() {
  const snapshot = await getNotificationPermissionSnapshot();
  if (snapshot.status === 'can_ask_again') return 'denied' as const;
  return snapshot.status;
}

export async function hasStoredPushToken() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  return Boolean(token?.trim());
}

export async function requestAndRegisterPushDevice(userId: string) {
  const registration = await registerForPushNotifications();
  if (!registration.ok) {
    return { ok: false as const, reason: registration.reason ?? 'unknown' };
  }
  const saved = await saveUserPushToken(userId, registration.expoPushToken);
  if (!saved.ok) return { ok: false as const, reason: 'unknown' as const };
  return { ok: true as const, token: registration.expoPushToken };
}

function resolveProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? null;
}

async function getExpoPushTokenWithoutPrompt(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { ok: false, message: 'الإشعارات غير متاحة على هذا الجهاز حالياً.', reason: 'unsupported' };
  }

  const settings = await Notifications.getPermissionsAsync();
  if (!settings.granted) {
    return { ok: false, message: 'الإذن بالإشعارات غير مفعّل.', reason: 'permission_denied' };
  }

  await ensureAndroidNotificationChannel();
  const projectId = resolveProjectId();
  if (!projectId) {
    return { ok: false, message: 'تعذر تفعيل الإشعارات حالياً.', reason: 'missing_project_id' };
  }

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, expoPushToken);
  return { ok: true, expoPushToken };
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { ok: false, message: 'الإشعارات غير متاحة على هذا الجهاز حالياً.', reason: 'unsupported' };
  }

  try {
    await ensureAndroidNotificationChannel();
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (!existing.granted && existing.canAskAgain) {
      finalStatus = await Notifications.requestPermissionsAsync();
    }

    if (!finalStatus.granted) {
      return { ok: false, message: 'الإذن بالإشعارات غير مفعّل.', reason: 'permission_denied' };
    }

    const projectId = resolveProjectId();
    if (!projectId) {
      return { ok: false, message: 'تعذر تفعيل الإشعارات حالياً.', reason: 'missing_project_id' };
    }

    const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, expoPushToken);
    return { ok: true, expoPushToken };
  } catch (error) {
    if (__DEV__) console.log('[Push] registerForPushNotifications failed', { message: (error as Error)?.message });
    return { ok: false, message: 'تعذر تفعيل الإشعارات حالياً.', reason: 'unknown' };
  }
}

export async function saveUserPushToken(
  userId: string,
  expoPushToken: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const result = await teswaBackendRuntime.notifications.registerPushDevice({
      userId,
      expoPushToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });

    if (!result.ok) {
      if (__DEV__) {
        console.log('[Push] saveUserPushToken failed', {
          reason: result.reason,
          message: result.message,
        });
      }
      return { ok: false, message: 'تعذر حفظ جهاز الإشعارات حالياً.' };
    }

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, expoPushToken);
    return { ok: true };
  } catch (error) {
    if (__DEV__) {
      console.log('[Push] saveUserPushToken crashed', {
        message: (error as Error)?.message,
      });
    }
    return { ok: false, message: 'تعذر حفظ جهاز الإشعارات حالياً.' };
  }
}

export async function syncPushDeviceRegistrationIfPermitted(userId: string) {
  try {
    const registration = await getExpoPushTokenWithoutPrompt();
    if (!registration.ok) {
      return { ok: registration.reason === 'permission_denied' || registration.reason === 'unsupported', skipped: registration.reason };
    }
    return saveUserPushToken(userId, registration.expoPushToken);
  } catch {
    return { ok: false as const, skipped: 'unknown' as const };
  }
}

export async function disableRegisteredPushDeviceIfPossible() {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return { ok: true as const, skipped: 'no_token' as const };

    const userId = (await teswaBackendRuntime.auth.getSession())?.user.id ?? null;
    if (!userId) return { ok: false as const };

    const result = await teswaBackendRuntime.notifications.disablePushDevice({
      userId,
      expoPushToken: token,
    });
    if (!result.ok) return { ok: false as const };

    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

const SAFE_PREFIXES = ['/deal/', '/offer/', '/item/', '/contextual/', '/profile/', '/direct/'] as const;

export function resolvePushNotificationRoute(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;

  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
  if (conversationId) return `/direct/${conversationId}`;

  const route = typeof payload.route === 'string' ? payload.route.trim() : '';
  if (route === '/notifications' || SAFE_PREFIXES.some((p) => route.startsWith(p))) return route;

  return null;
}


export type NotificationActionResolution = {
  id: string;
  route: string;
  actionIdentifier: string;
  conversationId: string | null;
  userText: string | null;
};

export function resolveNotificationActionResponse(response: Notifications.NotificationResponse | null | undefined): NotificationActionResolution | null {
  if (!response) return null;
  const id = response.notification.request.identifier;
  const route = resolvePushNotificationRoute(response.notification.request.content.data);
  if (!route) return null;

  const data = response.notification.request.content.data as Record<string, unknown> | undefined;
  const rawConversationId = data && typeof data.conversationId === 'string' ? data.conversationId.trim() : '';
  const userText = typeof response.userText === 'string' ? response.userText.trim() : '';

  return {
    id,
    route,
    actionIdentifier: response.actionIdentifier,
    conversationId: rawConversationId || null,
    userText: userText || null,
  };
}
export function getRouteFromNotificationResponse(response: Notifications.NotificationResponse | null | undefined): { id: string; route: string } | null {
  if (!response) return null;
  const id = response.notification.request.identifier;
  const route = resolvePushNotificationRoute(response.notification.request.content.data);
  if (!route) return null;
  return { id, route };
}
