import type {
  AnalyticsContract,
  AnalyticsTrackResult,
} from '@/lib/backend/contracts/analytics';
import { supabase } from '@/lib/supabase/client';

export function createSupabaseAnalyticsAdapter(): AnalyticsContract {
  return {
    async track(eventName, context) {
      const { data, error } = await supabase.rpc('track_analytics_event', {
        p_event_name: eventName,
        p_session_id: context.sessionId,
        p_route: context.route,
        p_entity_type: context.entityType,
        p_entity_id: context.entityId,
        p_metadata: context.metadata,
        p_app_version: context.appVersion,
        p_platform: context.platform,
      });

      if (error) throw error;

      const row = data as { ok?: boolean; reason?: string } | null;
      const result: AnalyticsTrackResult = {
        accepted: row?.ok !== false,
        reason:
          typeof row?.reason === 'string' && row.reason.trim()
            ? row.reason
            : null,
      };
      return result;
    },

    async trackPerformance(metricName, durationMs, properties = {}) {
      await this.track('performance_metric', {
        sessionId: '',
        route: null,
        entityType: metricName,
        entityId: null,
        metadata: {
          duration_ms: durationMs,
          ...properties,
        },
        appVersion: null,
        platform: 'unknown',
      });
    },
  };
}
