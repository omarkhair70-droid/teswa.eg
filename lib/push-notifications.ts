import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';

const PUSH_TOKEN_KEY = 'teswa.push.expo_token';
const ANDROID_CHANNEL_ID = 'teswa-activity';

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

function resolveProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? null;
}

export async function requestAndRegisterPushDevice(userId: string) {
  if (Platform.OS === 'web') return { ok: false as const, reason: 'unsupported' as const };

  try {
    await ensureAndroidNotificationChannel();
    let perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) perms = await Notifications.requestPermissionsAsync();
    if (!perms.granted) return { ok: false as const, reason: 'permission_denied' as const };

    const projectId = resolveProjectId();
    if (!projectId) {
      if (__DEV__) console.log('[Push] missing projectId');
      return { ok: false as const, reason: 'missing_project_id' as const };
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { data, error } = await supabase.rpc('register_push_device', { p_expo_push_token: token, p_platform: Platform.OS });
    if (error) {
      if (__DEV__) console.log('[Push] register RPC failed', { code: error.code, message: error.message });
      return { ok: false as const, reason: 'rpc_failed' as const };
    }
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return { ok: true as const, token, deviceId: data as string };
  } catch (error) {
    if (__DEV__) console.log('[Push] register failed', { message: (error as { message?: string })?.message });
    return { ok: false as const, reason: 'register_failed' as const };
  }
}

export async function syncPushDeviceRegistrationIfPermitted(userId: string) {
  if (Platform.OS === 'web') return { ok: true as const, skipped: 'unsupported' as const };

  try {
    await ensureAndroidNotificationChannel();
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return { ok: true as const, skipped: 'not_granted' as const };

    const projectId = resolveProjectId();
    if (!projectId) {
      if (__DEV__) console.log('[Push] missing projectId');
      return { ok: false as const, reason: 'missing_project_id' as const };
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('register_push_device', { p_expo_push_token: token, p_platform: Platform.OS });
    if (error) {
      if (__DEV__) console.log('[Push] passive register RPC failed', { code: error.code, message: error.message });
      return { ok: false as const, reason: 'rpc_failed' as const };
    }
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return { ok: true as const };
  } catch (error) {
    if (__DEV__) console.log('[Push] passive register failed', { message: (error as { message?: string })?.message });
    return { ok: false as const, reason: 'register_failed' as const };
  }
}

export async function disableRegisteredPushDeviceIfPossible() {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return { ok: true as const, skipped: 'no_token' as const };
    const { data, error } = await supabase.rpc('disable_my_push_device', { p_expo_push_token: token });
    if (error) {
      if (__DEV__) console.log('[Push] disable RPC failed', { code: error.code, message: error.message });
      return { ok: false as const };
    }
    if (data) await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    return { ok: true as const };
  } catch (error) {
    if (__DEV__) console.log('[Push] disable failed', { message: (error as { message?: string })?.message });
    return { ok: false as const };
  }
}

const SAFE_PREFIXES = ['/deal/', '/offer/', '/item/'] as const;
export function resolvePushNotificationRoute(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  const route = typeof payload.route === 'string' ? payload.route.trim() : '';
  if (route === '/notifications' || SAFE_PREFIXES.some((p) => route.startsWith(p))) return route;
  const dealId = typeof payload.dealId === 'string' ? payload.dealId : null;
  const offerId = typeof payload.offerId === 'string' ? payload.offerId : null;
  const itemId = typeof payload.itemId === 'string' ? payload.itemId : null;
  if (dealId) return `/deal/${dealId}`;
  if (offerId) return `/offer/${offerId}`;
  if (itemId) return `/item/${itemId}`;
  return null;
}

export function navigateFromNotificationResponse(response: Notifications.NotificationResponse | null | undefined, seen: Set<string>) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (seen.has(id)) return;
  seen.add(id);
  const route = resolvePushNotificationRoute(response.notification.request.content.data);
  if (route) router.push(route as never);
}
