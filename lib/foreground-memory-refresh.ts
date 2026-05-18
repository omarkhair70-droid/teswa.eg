import * as Network from 'expo-network';
import { AppState, AppStateStatus } from 'react-native';
import { refreshPublicOfflineMemoryInBackground } from '@/lib/background-memory-refresh';

const FOREGROUND_MEMORY_REFRESH_MIN_INTERVAL_MS = 15 * 60 * 1000;
const NETWORK_POLL_INTERVAL_MS = 60 * 1000;

let lastForegroundRefreshAtMs = 0;
let foregroundRefreshInFlight: Promise<void> | null = null;
let lastKnownReachable: boolean | null = null;

async function getNetworkReachable(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    if (__DEV__) {
      console.warn('[foreground-memory-refresh] network state check failed');
    }
    return false;
  }
}

export async function runForegroundMemoryRefreshIfAllowed(
  reason: 'app_active' | 'network_recovered' | 'manual_bootstrap',
): Promise<void> {
  try {
    if (foregroundRefreshInFlight) {
      return foregroundRefreshInFlight;
    }

    const reachable = await getNetworkReachable();
    lastKnownReachable = reachable;

    if (!reachable) {
      return;
    }

    const now = Date.now();
    if (now - lastForegroundRefreshAtMs < FOREGROUND_MEMORY_REFRESH_MIN_INTERVAL_MS) {
      return;
    }

    foregroundRefreshInFlight = (async () => {
      try {
        const result = await refreshPublicOfflineMemoryInBackground();
        lastForegroundRefreshAtMs = Date.now();
        if (__DEV__) {
          console.log('[foreground-memory-refresh] refreshed public memory', { reason, result });
        }
      } catch {
        if (__DEV__) {
          console.warn('[foreground-memory-refresh] refresh failed');
        }
      } finally {
        foregroundRefreshInFlight = null;
      }
    })();

    await foregroundRefreshInFlight;
  } catch {
    // non-throwing by design
  }
}

export function createForegroundMemoryRefreshSubscription(): {
  remove: () => void;
} {
  const appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      void runForegroundMemoryRefreshIfAllowed('app_active');
    }
  });

  const networkPollInterval = setInterval(() => {
    void (async () => {
      try {
        const reachable = await getNetworkReachable();
        if (lastKnownReachable === false && reachable) {
          void runForegroundMemoryRefreshIfAllowed('network_recovered');
        }
        lastKnownReachable = reachable;
      } catch {
        // non-throwing by design
      }
    })();
  }, NETWORK_POLL_INTERVAL_MS);

  void runForegroundMemoryRefreshIfAllowed('manual_bootstrap');

  return {
    remove: () => {
      appStateSubscription.remove();
      clearInterval(networkPollInterval);
    },
  };
}
