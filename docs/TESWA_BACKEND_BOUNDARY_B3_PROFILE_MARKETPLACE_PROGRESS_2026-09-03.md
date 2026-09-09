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


## Slice B3.2 — Marketplace feed / nearby / detail reads

Added `MarketplaceReadContract` and `createSupabaseMarketplaceReadAdapter()`.

Migrated `lib/marketplace-items.ts` off direct Supabase access for:

- marketplace feed pagination and filters;
- nearby marketplace RPC reads;
- single feed-item read;
- active item detail base row;
- item image/category/owner/wanted-tag detail reads.

The feature module still performs Teswa-level enrichment through the existing item-video and item-like services, preserving current UI behavior.

### Result

`lib/marketplace-items.ts` no longer imports `@/lib/supabase/client`.

Supabase table/view/RPC names for these Marketplace reads now live inside the provider adapter.

Profile bans, image ordering, wanted-tag normalization, video teaser enrichment, like counts, and viewer-like state retain their existing behavior.

No Marketplace writes/lifecycle operations were migrated in this slice.


## Slice B3.3 — Close core Profile module provider access

Completed provider decoupling for `lib/profiles.ts`.

Migrated:

- profile update/write through `ProfileCoreContract.updateMine`;
- active public-profile listing reads through `MarketplaceReadContract.listActiveByOwner`.

Preserved in feature code:

- username validation;
- Arabic product-facing error messages;
- profile tagline length rule;
- profile bootstrap timeout;
- item-video presence enrichment for public profile listings.

### Result

`lib/profiles.ts` no longer imports or calls Supabase directly.

The Profile adapter owns profile row read/write mapping; the Marketplace adapter owns active owner-listing table joins.

No production backend switch was made.
