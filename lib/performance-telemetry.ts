import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { trackEvent } from '@/lib/analytics';

export type PerformanceMetricName =
  | 'app_start_to_first_screen'
  | 'auth_ready_time'
  | 'home_first_content_time'
  | 'direct_chat_first_message_time'
  | 'dolab_first_content_time'
  | 'item_detail_first_content_time';

export type PerformanceStartType = 'cold_start' | 'warm_start' | 'unknown';
export type PerformanceNetworkState = 'online' | 'offline' | 'unknown';

export type PerformanceMetricMetadata = {
  route?: string;
  cacheHit?: boolean;
  startType?: PerformanceStartType;
  networkState?: PerformanceNetworkState;
  source?: 'cached' | 'live';
};

const PERFORMANCE_SAMPLE_RATE = 0.2;
const sessionStartedAtMs = Date.now();
const sessionSampled = Math.random() < PERFORMANCE_SAMPLE_RATE;
let currentStartType: PerformanceStartType = 'cold_start';
let currentNetworkState: PerformanceNetworkState | null = null;

const safeMetricNames = new Set<PerformanceMetricName>([
  'app_start_to_first_screen',
  'auth_ready_time',
  'home_first_content_time',
  'direct_chat_first_message_time',
  'dolab_first_content_time',
  'item_detail_first_content_time',
]);

const normalizeDuration = (durationMs: number): number | null => {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  return Math.round(durationMs);
};

export function getPerformanceSessionElapsedMs(): number {
  return Date.now() - sessionStartedAtMs;
}

export function setPerformanceStartType(startType: PerformanceStartType): void {
  currentStartType = startType;
}

export function setPerformanceNetworkState(networkState: PerformanceNetworkState): void {
  currentNetworkState = networkState;
}

export function isPerformanceTelemetrySampled(): boolean {
  return sessionSampled;
}

export async function trackPerformanceMetric(
  metricName: PerformanceMetricName,
  durationMs: number,
  metadata: PerformanceMetricMetadata = {},
): Promise<void> {
  if (!sessionSampled) return;
  if (!safeMetricNames.has(metricName)) return;

  const safeDurationMs = normalizeDuration(durationMs);
  if (safeDurationMs == null) return;

  const route = metadata.route ?? 'unknown';
  const appVersion = Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null;
  const platform = Platform.OS;

  await trackEvent('performance_metric', {
    route,
    metadata: {
      metricName,
      durationMs: safeDurationMs,
      route,
      appVersion,
      platform,
      cacheHit: metadata.cacheHit,
      startType: metadata.startType ?? currentStartType,
      networkState: metadata.networkState ?? currentNetworkState ?? undefined,
      source: metadata.source,
    },
  });
}
