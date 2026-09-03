# Teswa Backend Boundary — B1 Auth Progress

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Slice B1.1

Implemented the first concrete provider adapter without changing the active backend provider.

### Added

- `lib/backend/adapters/supabase/auth-adapter.ts`
- `lib/backend/runtime.ts`

### Migrated consumers

- `app/(auth)/login.tsx`
- `app/(auth)/signup.tsx`

These screens no longer import the Supabase client directly.

### Preserved behavior

- email/password sign-in;
- email-not-confirmed UX;
- signup with optional email confirmation;
- resend signup confirmation;
- Supabase remains the active provider.

### Boundary debt movement

Direct `@/lib/supabase/client` imports are ratcheted from **65 -> 63**.

The boundary checker now also fails on stale legacy allowlist entries so a migrated file cannot silently re-enter the legacy set later.

### Deliberately not migrated yet

- `lib/auth.tsx`
- Google browser/native OAuth modules
- account deletion
- auth refresh lifecycle in `lib/supabase/client.ts`

Those move in later B1 slices after the adapter path is validated.


## Slice B1.2 — AuthProvider session ownership

Migrated `lib/auth.tsx` to the Teswa Auth boundary.

Changes:

- `AuthContextValue.session` now exposes `TeswaAuthSession | null`.
- `AuthContextValue.user` now exposes `TeswaAuthUser | null`.
- bootstrap session hydration uses `AuthContract.getSession()`.
- auth state changes use `AuthContract.subscribeToAuthState()`.
- sign-out uses `AuthContract.signOut()`.
- the Supabase `Session` / `User` imports were removed from the public auth context.
- direct Supabase client import was removed from `lib/auth.tsx`.

Consumer audit before the change found no feature depending on Supabase-only auth fields. Current consumers primarily use `user.id`; account settings also uses `user.email`, both of which are Teswa-owned fields.

Direct Supabase client imports ratchet **63 -> 62**.


## Slice B1.3 — Google browser/native auth

Migrated all current Google auth provider calls behind `AuthContract`:

- `lib/google-auth.ts`
- `lib/google-native-auth.native.ts`
- `lib/google-native-auth.ts`
- `lib/google-native-auth-v2.ts`

Behavior preserved:

- native Google Sign-In;
- ID-token session completion;
- browser OAuth fallback;
- OAuth callback completion;
- native-success session verification;
- current diagnostics/fallback semantics.

The existing diagnostics event labels containing `supabase_*` are temporarily preserved for compatibility with the diagnostics screen. They are now legacy observability labels only; the feature modules no longer import/call Supabase directly.

Direct Supabase client imports ratchet **62 -> 58**.


## Slice B1.4 — Remove remaining feature-level Auth SDK calls

Removed direct `supabase.auth.*` access from the remaining feature/service auth call sites:

- `lib/direct-privacy.ts`
- `lib/account-deletion.ts`
- `lib/chat/direct-runtime-auth.ts`
- `lib/analytics.ts`
- `lib/stories.ts`
- `lib/dolab/chat-bridge.ts`
- `lib/chat/native-direct-channel.ts`

Key details:

- provider-neutral `TeswaAuthUser.avatarUrl` replaces Direct Chat access to raw `user_metadata`;
- Stories now gets `accessToken` from `TeswaAuthSession`; its raw Supabase Storage upload remains explicitly deferred to B2 Media/Storage;
- account deletion still invokes the Supabase Edge Function directly, but its session dependency is now Teswa-owned;
- files that still use Supabase for DB/Storage/Functions keep that non-Auth provider dependency for later domain slices.

Direct Supabase client imports ratchet **58 -> 55** because three Auth-only files no longer need the provider client.

The boundary checker now rejects any `supabase.auth.*` usage outside:

- `lib/backend/adapters/supabase/**`
- `lib/supabase/**`

This turns the B1 Auth boundary into an enforced architectural rule.
