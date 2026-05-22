import AsyncStorage from '@react-native-async-storage/async-storage';

const STARTUP_TRACE_KEY = 'teswa:startup:last-trace:v1';

type StartupTraceEventName =
  | 'bootstrap_start'
  | 'onboarding_read_done'
  | 'get_session_done'
  | 'account_gate_cache_read_done'
  | 'bootstrap_ready_set'
  | 'profile_check_start'
  | 'profile_check_end'
  | 'policy_check_start'
  | 'policy_check_end'
  | 'auth_state_change_start'
  | 'auth_state_change_end';

type StartupTraceData = {
  hasSession?: boolean;
  hasCachedGate?: boolean;
  usedCachedGate?: boolean;
  reason?: string;
  outcome?: 'ok' | 'error';
  waitingReason?: string;
};

type StartupTraceEvent = {
  name: StartupTraceEventName;
  t: number;
  data?: StartupTraceData;
};

class StartupTrace {
  private readonly startedAt = Date.now();
  private readonly events: StartupTraceEvent[] = [];
  private routeGuardReasons = new Set<string>();

  mark(name: StartupTraceEventName, data?: StartupTraceData) {
    this.events.push({ name, t: Date.now(), data });
    void this.flushIfDev();
  }

  markRouteGuardWaitingReason(reason: string) {
    if (this.routeGuardReasons.has(reason)) return;
    this.routeGuardReasons.add(reason);
    if (__DEV__) console.log('[startup-trace] route_guard_waiting_reason', reason);
    void this.flushIfDev();
  }

  private async flushIfDev() {
    if (!__DEV__) return;
    const snapshot = this.snapshot();
    console.log('[startup-trace] summary', snapshot);
    try {
      await AsyncStorage.setItem(STARTUP_TRACE_KEY, JSON.stringify(snapshot));
    } catch {
      // noop
    }
  }

  snapshot() {
    const totalMs = Date.now() - this.startedAt;
    const timeline = this.events.map((event) => ({
      name: event.name,
      dtMs: event.t - this.startedAt,
      data: event.data,
    }));
    return {
      totalMs,
      routeGuardWaitingReasons: Array.from(this.routeGuardReasons),
      timeline,
    };
  }
}

export const startupTrace = new StartupTrace();
