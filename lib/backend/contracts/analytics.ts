export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export type AnalyticsEventContext = {
  sessionId: string;
  route: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  appVersion: string | null;
  platform: string;
};

export type AnalyticsTrackResult = {
  accepted: boolean;
  reason: string | null;
};

export interface AnalyticsContract {
  track(
    eventName: string,
    context: AnalyticsEventContext,
  ): Promise<AnalyticsTrackResult>;

  trackPerformance(
    metricName: string,
    durationMs: number,
    properties?: AnalyticsProperties,
  ): Promise<void>;
}
