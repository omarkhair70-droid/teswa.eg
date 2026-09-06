import type {
  AuthContract,
  AuthFailureReason,
  AuthStateEvent,
  TeswaAuthSession,
  TeswaAuthUser,
} from '@/lib/backend/contracts/auth';
import type { TeswaResult } from '@/lib/backend/contracts/core';
import {
  clearOracleAuthSession,
  readOracleAuthSession,
  writeOracleAuthSession,
} from '@/lib/backend/adapters/oracle/auth-storage';

type JsonObject = Record<string, unknown>;
type OracleAuthAdapterOptions = { baseUrl?: string | null };
type RequestResult =
  | { ok: true; status: number; body: JsonObject }
  | { ok: false; reason: 'network'; message: string; cause?: unknown };

const listeners = new Set<(event: AuthStateEvent, session: TeswaAuthSession | null) => void>();
const REQUEST_TIMEOUT_MS = 12_000;

function success<T>(data: T): TeswaResult<T, AuthFailureReason> {
  return { ok: true, data };
}

function failure<R extends AuthFailureReason>(reason: R, message: string, cause?: unknown): TeswaResult<never, R> {
  return { ok: false, reason, message, retryable: reason === 'network' || reason === 'rate_limited', cause };
}

function emit(event: AuthStateEvent, session: TeswaAuthSession | null) {
  for (const listener of listeners) {
    try { listener(event, session); } catch { /* Listener isolation. */ }
  }
}

function normalizeBaseUrl(input?: string | null): string | null {
  const raw = input ?? process.env.EXPO_PUBLIC_TESWA_ORACLE_AUTH_URL ?? '';
  const normalized = raw.trim().replace(/\/+$/, '');
  if (!normalized) return null;
  if (!normalized.startsWith('https://')) return null;
  return normalized;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapUser(value: unknown): TeswaAuthUser | null {
  const row = asObject(value);
  if (!row || typeof row.id !== 'string' || !row.id) return null;
  return {
    id: row.id,
    email: asNullableString(row.email),
    phone: asNullableString(row.phone),
    displayName: asNullableString(row.display_name),
    avatarUrl: asNullableString(row.avatar_url),
  };
}

function mapSession(body: JsonObject): TeswaAuthSession | null {
  const accessToken = asNullableString(body.access_token);
  const user = mapUser(body.user);
  if (!accessToken || !user) return null;
  return {
    accessToken,
    refreshToken: asNullableString(body.refresh_token),
    expiresAt: typeof body.expires_at === 'number' && Number.isFinite(body.expires_at) ? body.expires_at : null,
    user,
  };
}

function apiError(body: JsonObject): string {
  return typeof body.error === 'string' ? body.error : 'unknown';
}

function mapApiFailure(status: number, body: JsonObject): TeswaResult<never, AuthFailureReason> {
  const error = apiError(body);
  if (status === 429) return failure('rate_limited', 'Too many authentication requests.');
  if (error === 'invalid_credentials') return failure('invalid_credentials', 'Invalid email or password.');
  if (error === 'email_not_confirmed') return failure('email_not_confirmed', 'Email confirmation is required.');
  if (error === 'invalid_session' || error === 'invalid_refresh_token') return failure('session_expired', 'The authentication session has expired.');
  if (error === 'invalid_google_token' || error === 'identity_not_mapped') return failure('provider_failed', 'Google authentication could not be completed.');
  return failure('unknown', `Oracle auth request failed (${error}).`);
}

async function requestJson(
  baseUrl: string | null,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: JsonObject; accessToken?: string | null } = {},
): Promise<RequestResult> {
  if (!baseUrl) {
    return { ok: false, reason: 'network', message: 'Oracle auth HTTPS endpoint is not configured.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    let parsed: unknown = {};
    try { parsed = await response.json(); } catch { parsed = {}; }
    return { ok: true, status: response.status, body: asObject(parsed) ?? {} };
  } catch (cause) {
    return { ok: false, reason: 'network', message: 'Oracle auth endpoint is unreachable.', cause };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistSession(session: TeswaAuthSession, event: AuthStateEvent) {
  await writeOracleAuthSession(session);
  emit(event, session);
}

export function createOracleAuthAdapter(options: OracleAuthAdapterOptions = {}): AuthContract {
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  const refreshSession = async (refreshToken: string): Promise<TeswaAuthSession | null> => {
    const response = await requestJson(baseUrl, '/v1/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    });
    if (!response.ok || response.status < 200 || response.status >= 300) {
      if (response.ok && response.status === 401) {
        await clearOracleAuthSession();
        emit('signed_out', null);
      }
      return null;
    }
    const session = mapSession(response.body);
    if (!session) return null;
    await persistSession(session, 'token_refreshed');
    return session;
  };

  const getSession = async (): Promise<TeswaAuthSession | null> => {
    const local = await readOracleAuthSession();
    if (!local) return null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (local.expiresAt !== null && local.expiresAt <= nowSeconds + 15) {
      if (local.refreshToken) return refreshSession(local.refreshToken);
      await clearOracleAuthSession();
      emit('signed_out', null);
      return null;
    }

    const validation = await requestJson(baseUrl, '/v1/auth/session', { accessToken: local.accessToken });
    if (!validation.ok) return local;
    if (validation.status === 200) {
      const verifiedUser = mapUser(validation.body.user);
      if (!verifiedUser) return local;
      const verified = { ...local, user: verifiedUser };
      await writeOracleAuthSession(verified);
      return verified;
    }
    if (validation.status === 401 && local.refreshToken) return refreshSession(local.refreshToken);
    if (validation.status === 401) {
      await clearOracleAuthSession();
      emit('signed_out', null);
      return null;
    }
    return local;
  };

  return {
    getSession,

    async getCurrentUser() {
      return (await getSession())?.user ?? null;
    },

    async signInWithPassword(input) {
      const response = await requestJson(baseUrl, '/v1/auth/password', {
        method: 'POST',
        body: { email: input.email, password: input.password },
      });
      if (!response.ok) return failure('network', response.message, response.cause);
      if (response.status < 200 || response.status >= 300) return mapApiFailure(response.status, response.body);
      const session = mapSession(response.body);
      if (!session) return failure('unknown', 'Oracle auth returned an invalid session payload.');
      await persistSession(session, 'signed_in');
      return success(session);
    },

    async signUp(input) {
      const response = await requestJson(baseUrl, '/v1/auth/sign-up', {
        method: 'POST',
        body: { email: input.email, password: input.password },
      });
      if (!response.ok) return failure('network', response.message, response.cause);
      if (response.status < 200 || response.status >= 300) return mapApiFailure(response.status, response.body);
      const user = mapUser(response.body.user);
      return success({ user, session: null });
    },

    async resendSignupConfirmation(email) {
      const response = await requestJson(baseUrl, '/v1/auth/resend-confirmation', {
        method: 'POST',
        body: { email },
      });
      if (!response.ok) return failure('network', response.message, response.cause);
      if (response.status < 200 || response.status >= 300) return mapApiFailure(response.status, response.body);
      return success(undefined);
    },

    async signInWithExternalIdToken(input) {
      if (input.provider !== 'google') return failure('provider_failed', 'Unsupported identity provider.');
      const response = await requestJson(baseUrl, '/v1/auth/google', {
        method: 'POST',
        body: { id_token: input.idToken },
      });
      if (!response.ok) return failure('network', response.message, response.cause);
      if (response.status < 200 || response.status >= 300) return mapApiFailure(response.status, response.body);
      const session = mapSession(response.body);
      if (!session) return failure('provider_failed', 'Oracle auth returned an invalid Google session payload.');
      await persistSession(session, 'signed_in');
      return success(session);
    },

    async startExternalSignIn() {
      return failure('provider_failed', 'Oracle browser OAuth ingress is not enabled. Use the native Google ID-token flow.');
    },

    async completeExternalSignIn() {
      return failure('provider_failed', 'Oracle browser OAuth callback exchange is not enabled.');
    },

    async signOut() {
      const local = await readOracleAuthSession();
      if (!local) return { ok: true, data: undefined };
      const response = await requestJson(baseUrl, '/v1/auth/logout', {
        method: 'POST',
        accessToken: local.accessToken,
      });
      if (!response.ok) {
        return { ok: false, reason: 'network', message: response.message, retryable: true, cause: response.cause };
      }
      if (response.status >= 500) {
        return { ok: false, reason: 'unknown', message: 'Oracle auth logout failed.' };
      }
      await clearOracleAuthSession();
      emit('signed_out', null);
      return { ok: true, data: undefined };
    },

    subscribeToAuthState(listener) {
      listeners.add(listener);
      Promise.resolve()
        .then(getSession)
        .then((session) => listener('initial', session))
        .catch(() => listener('initial', null));
      return () => listeners.delete(listener);
    },
  };
}
