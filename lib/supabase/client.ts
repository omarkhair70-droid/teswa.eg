import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import { supabaseAuthStorage } from '@/lib/supabase/auth-storage';

const startupStartedAt = Date.now();
const startupLog = (event: string, data?: Record<string, unknown>) => {
  console.log('[StartupTiming]', event, { dtMs: Date.now() - startupStartedAt, ...data });
};
let authRefreshLifecycleRegistered = false;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars are missing. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: supabaseAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

startupLog('supabase_client_created', {
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
});

if (Platform.OS !== 'web' && !authRefreshLifecycleRegistered) {
  authRefreshLifecycleRegistered = true;
  startupLog('supabase_auth_refresh_lifecycle_registered');

  if (AppState.currentState === 'active') {
    startupLog('supabase_auth_start_auto_refresh');
    supabase.auth.startAutoRefresh();
  } else {
    startupLog('supabase_auth_stop_auto_refresh');
    supabase.auth.stopAutoRefresh();
  }

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      startupLog('supabase_auth_start_auto_refresh');
      supabase.auth.startAutoRefresh();
    } else {
      startupLog('supabase_auth_stop_auto_refresh');
      supabase.auth.stopAutoRefresh();
    }
  });
}
