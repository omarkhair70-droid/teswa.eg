# Teswa Backend Boundary — B3 Profile / Marketplace Progress

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Slice B3.1 — Core Profile reads

Implemented a provider-neutral Profile read boundary.

### Added

- `ProfileReadContract`
- `createSupabaseProfileReadAdapter()`
- `teswaBackendRuntime.profiles`

### Migrated reads

`lib/profiles.ts` now routes these through the Teswa backend boundary:

- `fetchMyProfile`
- `fetchMyAccountProfile`
- `fetchPublicProfileById`

The existing profile bootstrap timeout behavior remains in `fetchMyProfile`.

### Provider-neutral profile shape

`TeswaProfile` now owns:

- id
- display name
- username
- bio
- avatar / cover
- city / area
- profile tagline
- successful swaps count
- response rate
- created timestamp

Supabase snake_case row mapping is isolated in the provider adapter.

### Deliberately not migrated in this slice

- profile update/write
- public profile active-listing aggregation
- people search
- follow/block/trust/badges
- Marketplace feed/detail reads

Those remain separate B3 slices to reduce regression radius.

No production provider switch was made.
