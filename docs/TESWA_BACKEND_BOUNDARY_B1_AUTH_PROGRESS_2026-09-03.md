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
