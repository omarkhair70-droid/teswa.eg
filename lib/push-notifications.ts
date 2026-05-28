import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';

const PUSH_TOKEN_KEY = 'teswa.push.expo_token';
const ANDROID_CHANNEL_ID = 'teswa-activity';

export type PushRegistrationResult =
  | { ok: true; expoPushToken: string }
  | { ok: false; message: string; reason?: 'permission_denied' | 'unsupported' | 'missing_project_id' | 'unknown' };

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


export async function getNotificationPermissionStatus() {
  if (Platform.OS === 'web') return 'unsupported' as const;
  const settings = await Notifications.getPermissionsAsync();
  return settings.granted ? 'granted' as const : 'denied' as const;
}

export async function hasStoredPushToken() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  return Boolean(token?.trim());
}

export async function requestAndRegisterPushDevice(_userId: string) {
  const registration = await registerForPushNotifications();
  if (!registration.ok) {
    return { ok: false as const, reason: registration.reason ?? 'unknown' };
  }
  const saved = await saveUserPushToken(registration.expoPushToken);
  if (!saved.ok) return { ok: false as const, reason: 'unknown' as const };
  return { ok: true as const, token: registration.expoPushToken };
}

function resolveProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? null;
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

export async function saveUserPushToken(expoPushToken: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.rpc('register_push_device', {
      p_expo_push_token: expoPushToken,
      p_platform: Platform.OS,
    });

    if (error) {
      if (__DEV__) console.log('[Push] saveUserPushToken failed', { code: error.code, message: error.message });
      return { ok: false, message: 'تعذر حفظ جهاز الإشعارات حالياً.' };
    }

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, expoPushToken);
    return { ok: true };
  } catch (error) {
    if (__DEV__) console.log('[Push] saveUserPushToken crashed', { message: (error as Error)?.message });
    return { ok: false, message: 'تعذر حفظ جهاز الإشعارات حالياً.' };
  }
}

export async function syncPushDeviceRegistrationIfPermitted(_userId: string) {
  const registration = await registerForPushNotifications();
  if (!registration.ok) {
    return { ok: registration.reason === 'permission_denied' || registration.reason === 'unsupported', skipped: registration.reason };
  }
  return saveUserPushToken(registration.expoPushToken);
}

export async function disableRegisteredPushDeviceIfPossible() {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return { ok: true as const, skipped: 'no_token' as const };
    const { data, error } = await supabase.rpc('disable_my_push_device', { p_expo_push_token: token });
    if (error) return { ok: false as const };
    if (data) await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
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
