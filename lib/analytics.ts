import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';

export type AnalyticsEventName =
  | 'app_opened'
  | 'session_started'
  | 'auth_gate_viewed'
  | 'home_viewed'
  | 'search_viewed'
  | 'item_detail_viewed'
  | 'item_create_started'
  | 'item_published'
  | 'offer_started'
  | 'offer_sent'
  | 'offer_action_taken'
  | 'deal_room_viewed'
  | 'deal_message_sent'
  | 'notification_opened'
  | 'story_viewed'
  | 'story_reply_started'
  | 'profile_viewed'
  | 'performance_metric';

export type TrackEventOptions = {
  route?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

const BLOCKED_METADATA_KEYS = new Set([
  'body', 'message', 'note', 'description', 'email', 'phone', 'token', 'secret', 'password', 'push_token',
  'pushtoken', 'phonenumber', 'messagebody', 'itemdescription', 'accesstoken', 'refreshtoken',
]);

let analyticsSessionId: string | null = null;

const shouldBlockMetadataKey = (rawKey: string): boolean => {
  const key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (BLOCKED_METADATA_KEYS.has(key)) return true;

  if (key.includes('token') || key.includes('secret') || key.includes('password') || key.includes('email') || key.includes('phone')) {
    return true;
  }

  if (key === 'body' || key.includes('body') || key === 'message' || key.includes('message') || key === 'note' || key.includes('note') || key === 'description' || key.includes('description')) {
    return true;
  }

  return false;
};

const isSafeScalar = (value: unknown): value is string | number | boolean | null =>
  value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const sanitizeMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> => {
  if (!metadata) return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (shouldBlockMetadataKey(key)) continue;
    if (Array.isArray(value)) {
      const safeArray = value.filter(isSafeScalar).slice(0, 20);
      sanitized[key] = safeArray;
      continue;
    }
    if (isSafeScalar(value)) {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === 'object') {
      sanitized[key] = '[object]';
    }
  }
  return sanitized;
};

export const getAnalyticsSessionId = (): string => {
  if (analyticsSessionId) return analyticsSessionId;
  analyticsSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return analyticsSessionId;
};

export async function trackEvent(eventName: AnalyticsEventName, options: TrackEventOptions = {}): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null;
    const platform = Platform.OS;

    await supabase.rpc('track_analytics_event', {
      p_event_name: eventName,
      p_session_id: getAnalyticsSessionId(),
      p_route: options.route ?? null,
      p_entity_type: options.entityType ?? null,
      p_entity_id: options.entityId ?? null,
      p_metadata: sanitizeMetadata(options.metadata),
      p_app_version: appVersion,
      p_platform: platform,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] trackEvent failed', {
        eventName,
        code: (error as { code?: string })?.code,
        message: (error as { message?: string })?.message,
      });
    }
  }
}
