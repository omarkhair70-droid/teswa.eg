import type { AuthContract } from '@/lib/backend/contracts/auth';

export type OracleHttpFailureReason =
  | 'configuration' | 'authentication' | 'forbidden' | 'not_found'
  | 'conflict' | 'rate_limited' | 'network' | 'server'
  | 'invalid_response' | 'unknown';

export type OracleHttpResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; reason: OracleHttpFailureReason; retryable: boolean };

export type OracleHttpRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

export type OracleHttpTransport = {
  request<T>(input: OracleHttpRequest): Promise<OracleHttpResult<T>>;
};

type Options = {
  auth: Pick<AuthContract, 'getSession'>;
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
};

const TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const API_PATH = /^\/v1\/[a-z0-9/_-]+$/;

function failure(reason: OracleHttpFailureReason, status: number | null = null): OracleHttpResult<never> {
  return { ok: false, status, reason, retryable: reason === 'network' || reason === 'server' || reason === 'rate_limited' };
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function responseFailure(status: number): OracleHttpResult<never> {
  if (status === 401) return failure('authentication', status);
  if (status === 403) return failure('forbidden', status);
  if (status === 404) return failure('not_found', status);
  if (status === 409) return failure('conflict', status);
  if (status === 429) return failure('rate_limited', status);
  if (status >= 500) return failure('server', status);
  return failure('unknown', status);
}

export function createOracleHttpTransport(options: Options): OracleHttpTransport {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.EXPO_PUBLIC_TESWA_ORACLE_API_URL);
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async request<T>(input: OracleHttpRequest): Promise<OracleHttpResult<T>> {
      if (!baseUrl || !API_PATH.test(input.path)) return failure('configuration');
      const method = input.method ?? 'GET';
      if (method === 'GET' && input.body !== undefined) return failure('configuration');

      // Only the Oracle Auth adapter may supply an identity. Never accept a
      // caller-provided bearer, service key, user-id header, or fallback provider.
      let session;
      try {
        session = await options.auth.getSession();
      } catch {
        return failure('authentication');
      }
      if (!session?.accessToken) return failure('authentication');
      if (session.expiresAt !== null && session.expiresAt <= Math.floor(Date.now() / 1000)) {
        return failure('authentication');
      }

      const url = new URL(input.path, baseUrl);
      for (const [key, value] of Object.entries(input.query ?? {})) {
        if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
      }
      let body: string | undefined;
      try {
        body = input.body === undefined ? undefined : JSON.stringify(input.body);
        if (input.body !== undefined && body === undefined) return failure('configuration');
      } catch {
        return failure('configuration');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetchImpl(url.toString(), {
          method,
          headers: {
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            Authorization: `Bearer ${session.accessToken}`,
          },
          body,
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
        });
        if (response.status < 200 || response.status >= 300) return responseFailure(response.status);
        if (response.status === 204) return { ok: true, status: 204, data: undefined as T };
        const raw = await response.text();
        if (raw.length > MAX_RESPONSE_BYTES) return failure('invalid_response', response.status);
        let data: unknown;
        try { data = JSON.parse(raw); } catch { return failure('invalid_response', response.status); }
        if (data === null || typeof data !== 'object') return failure('invalid_response', response.status);
        return { ok: true, status: response.status, data: data as T };
      } catch {
        // Do not expose URLs, bearer tokens, request bodies, or upstream errors.
        return failure('network');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
