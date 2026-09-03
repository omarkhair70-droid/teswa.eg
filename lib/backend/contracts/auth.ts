import type { TeswaResult, TeswaUnsubscribe } from '@/lib/backend/contracts/core';

export type TeswaAuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type TeswaAuthSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  user: TeswaAuthUser;
};

export type AuthStateEvent =
  | 'initial'
  | 'signed_in'
  | 'signed_out'
  | 'token_refreshed'
  | 'user_updated';

export type AuthFailureReason =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'provider_cancelled'
  | 'provider_failed'
  | 'session_expired'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export interface AuthContract {
  getSession(): Promise<TeswaAuthSession | null>;
  getCurrentUser(): Promise<TeswaAuthUser | null>;

  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<TeswaResult<TeswaAuthSession, AuthFailureReason>>;

  signUp(input: {
    email: string;
    password: string;
  }): Promise<TeswaResult<{ user: TeswaAuthUser | null; session: TeswaAuthSession | null }, AuthFailureReason>>;

  resendSignupConfirmation(email: string): Promise<TeswaResult<void, AuthFailureReason>>;

  signInWithExternalIdToken(input: {
    provider: 'google';
    idToken: string;
    nonce?: string;
  }): Promise<TeswaResult<TeswaAuthSession, AuthFailureReason>>;

  startExternalSignIn(input: {
    provider: 'google';
    redirectTo?: string;
  }): Promise<TeswaResult<{ authorizationUrl: string | null }, AuthFailureReason>>;

  completeExternalSignIn(url: string): Promise<TeswaResult<TeswaAuthSession, AuthFailureReason>>;
  signOut(): Promise<TeswaResult<void, 'network' | 'unknown'>>;

  subscribeToAuthState(
    listener: (event: AuthStateEvent, session: TeswaAuthSession | null) => void,
  ): TeswaUnsubscribe;
}
