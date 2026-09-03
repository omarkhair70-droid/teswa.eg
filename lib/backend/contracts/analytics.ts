export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export interface AnalyticsContract {
  track(eventName: string, properties?: AnalyticsProperties): Promise<void>;
  trackPerformance(metricName: string, durationMs: number, properties?: AnalyticsProperties): Promise<void>;
}
