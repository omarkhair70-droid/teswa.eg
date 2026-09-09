# Teswa Backend Boundary — B1 Auth / Session Handoff

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Status

B1 is complete for provider isolation.

Supabase remains the active production auth provider, but Teswa feature code now consumes Teswa-owned auth contracts instead of calling Supabase Auth directly.

## Implemented

- concrete `createSupabaseAuthAdapter()`;
- `teswaBackendRuntime.auth` composition root;
- provider-neutral `TeswaAuthUser` and `TeswaAuthSession`;
- Login and Signup routed through `AuthContract`;
- `AuthProvider` session/user state migrated off Supabase `Session/User`;
- Google browser OAuth routed through `AuthContract`;
- Google native ID-token auth routed through `AuthContract`;
- account deletion session check routed through `AuthContract`;
- Direct Chat runtime identity/session lookups routed through `AuthContract`;
- Dolab identity lookup routed through `AuthContract`;
- analytics identity lookup routed through `AuthContract`;
- Stories upload session token lookup routed through `AuthContract`;
- Direct Privacy identity lookup routed through `AuthContract`;
- provider-neutral avatar mapping replaces raw `user_metadata` reads in Direct Chat.

## Boundary enforcement

`scripts/check-backend-boundary.mjs` now rejects:

- new direct Supabase client imports outside the frozen legacy allowlist;
- stale legacy allowlist entries;
- new `@supabase/supabase-js` provider type leakage;
- any feature-level `supabase.auth.*` access outside:
  - `lib/backend/adapters/supabase/**`
  - `lib/supabase/**`

Current legacy direct Supabase client import count:

**55**

This is down from the Phase 0 baseline of 65.

## Validation

Backend Boundary Validation run:

- boundary guard: **success**
- npm install: **success**
- TypeScript: **success**

Validated head:

`85244cb375ae063cb3327bd4fa24e68c15376b1c`

Successful run:

`33745109152`

## Important non-Auth debt intentionally left

These files may still import the Supabase client for non-Auth responsibilities:

- DB queries / RPCs;
- Storage;
- Edge Functions;
- Realtime.

Examples:

- `lib/account-deletion.ts` still invokes the Supabase `delete-account` Edge Function;
- `lib/stories.ts` still uses Supabase Storage and a raw Storage REST upload URL;
- `lib/analytics.ts` still writes through the Supabase analytics RPC;
- `lib/direct-privacy.ts` still reads/writes the profile row through Supabase.

Those are owned by later domain slices, not B1.

## Next

B2 — Media / Storage boundary.

Goals:

- logical media purposes instead of physical bucket names in feature code;
- concrete Supabase Media adapter;
- move signed URL/public URL/remove operations behind `MediaStorageContract`;
- migrate low-risk Storage consumers first;
- preserve current upload, cleanup, progress, and rollback behavior;
- no production provider cutover.
