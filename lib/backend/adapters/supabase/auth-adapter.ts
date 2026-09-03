import * as QueryParams from 'expo-auth-session/build/QueryParams';

import type {
  AuthContract,
  AuthFailureReason,
  AuthStateEvent,
  TeswaAuthSession,
  TeswaAuthUser,
} from '@/lib/backend/contracts/auth';
import { supabase } from '@/lib/supabase/client';

function mapUser(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): TeswaAuthUser {
  const metadata = user.user_metadata ?? {};
  const displayNameCandidates = [
    metadata.display_name,
    metadata.full_name,
    metadata.name,
  ];
  const displayName = displayNameCandidates.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  const avatarCandidates = [metadata.avatar_url, metadata.picture];
  const avatarUrl = avatarCandidates.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    displayName: displayName?.trim() ?? null,
    avatarUrl: avatarUrl?.trim() ?? null,
  };
}

function mapSession(session: {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  user: Parameters<typeof mapUser>[0];
}): TeswaAuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? null,
    expiresAt: session.expires_at ?? null,
    user: mapUser(session.user),
  };
}

function mapAuthFailure(error: unknown): AuthFailureReason {
  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase();
  const status = Number((error as { status?: unknown } | null)?.status ?? 0);

  if (message.includes('email not confirmed') || message.includes('confirm your email')) {
    return 'email_not_confirmed';
  }
  if (
    message.includes('invalid login credentials')
    || message.includes('invalid credentials')
    || message.includes('invalid password')
  ) {
    return 'invalid_credentials';
  }
  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limited';
  }
  if (
    message.includes('network')
    || message.includes('fetch')
    || message.includes('connection')
    || message.includes('timeout')
  ) {
    return 'network';
  }
  if (
    message.includes('session')
    && (message.includes('expired') || message.includes('missing'))
  ) {
    return 'session_expired';
  }
  return 'unknown';
}

function mapAuthStateEvent(event: string): AuthStateEvent {
  switch (event) {
    case 'SIGNED_IN':
      return 'signed_in';
    case 'SIGNED_OUT':
      return 'signed_out';
    case 'TOKEN_REFRESHED':
      return 'token_refreshed';
    case 'USER_UPDATED':
    case 'PASSWORD_RECOVERY':
      return 'user_updated';
    case 'INITIAL_SESSION':
    default:
      return 'initial';
  }
}

export function createSupabaseAuthAdapter(): AuthContract {
  return {
    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session ? mapSession(data.session) : null;
    },

    async getCurrentUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user ? mapUser(data.user) : null;
    },

    async signInWithPassword(input) {
      const { data, error } = await supabase.auth.signInWithPassword(input);
      if (error || !data.session) {
        return {
          ok: false,
          reason: mapAuthFailure(error),
          message: error?.message ?? 'Authentication failed.',
        };
      }
      return { ok: true, data: mapSession(data.session) };
    },

    async signUp(input) {
      const { data, error } = await supabase.auth.signUp(input);
      if (error) {
        return {
          ok: false,
          reason: mapAuthFailure(error),
          message: error.message,
        };
      }
      return {
        ok: true,
        data: {
          user: data.user ? mapUser(data.user) : null,
          session: data.session ? mapSession(data.session) : null,
        },
      };
    },

    async resendSignupConfirmation(email) {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) {
        return {
          ok: false,
          reason: mapAuthFailure(error),
          message: error.message,
        };
      }
      return { ok: true, data: undefined };
    },

    async signInWithExternalIdToken(input) {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: input.provider,
        token: input.idToken,
        nonce: input.nonce,
      });
      if (error || !data.session) {
        return {
          ok: false,
          reason: mapAuthFailure(error),
          message: error?.message ?? 'Authentication failed.',
        };
      }
      return { ok: true, data: mapSession(data.session) };
    },

    async startExternalSignIn(input) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: input.provider,
        options: {
          redirectTo: input.redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        return {
          ok: false,
          reason: mapAuthFailure(error),
          message: error.message,
        };
      }
      return { ok: true, data: { authorizationUrl: data.url ?? null } };
    },

    async completeExternalSignIn(url) {
      const { params, errorCode } = QueryParams.getQueryParams(url) as {
        params: {
          access_token?: string;
          refresh_token?: string;
          code?: string;
          error?: string;
          error_description?: string;
        };
        errorCode: string | null;
      };

      if (errorCode || params.error || params.error_description) {
        return {
          ok: false,
          reason: 'provider_failed',
          message: params.error_description ?? params.error ?? errorCode ?? 'OAuth callback failed.',
        };
      }

      if (params.access_token && params.refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (error || !data.session) {
          return {
            ok: false,
            reason: mapAuthFailure(error),
            message: error?.message ?? 'OAuth session failed.',
          };
        }
        return { ok: true, data: mapSession(data.session) };
      }

      if (!params.code) {
        return {
          ok: false,
          reason: 'provider_failed',
          message: 'OAuth callback did not include a usable session or code.',
        };
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error || !data.session) {
        return {
          ok: false,
          reason: mapAuthFailure(error),
          message: error?.message ?? 'OAuth code exchange failed.',
        };
      }
      return { ok: true, data: mapSession(data.session) };
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return {
          ok: false,
          reason: mapAuthFailure(error) === 'network' ? 'network' : 'unknown',
          message: error.message,
        };
      }
      return { ok: true, data: undefined };
    },

    subscribeToAuthState(listener) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        listener(mapAuthStateEvent(event), session ? mapSession(session) : null);
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
