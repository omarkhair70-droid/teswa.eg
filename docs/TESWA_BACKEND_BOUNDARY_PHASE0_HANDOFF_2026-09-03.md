# Teswa Backend Boundary — Phase 0 Handoff

Date: 2026-09-03  
Lane: Backend Decoupling Architecture  
Branch: `refactor/backend-boundary-20260903`

## Lane base

Architecture/inventory base:

`14e7198ec42f33bf0fca781c0c5c0502c628b786`

Implementation commit:

`395465247d3c882c4d388b317f6b9fccbd9b0fec`

## Scope completed

Phase 0 is an architecture-only boundary slice.

Completed:

- read and followed `docs/TESWA_COMPANY_CLOSURE_PARALLEL_PLAN_2026-09-03.md`;
- inventoried every current direct `@/lib/supabase/client` import found in client/source code;
- inventoried client RPC/Auth/Storage/Realtime/Edge Function coupling;
- identified provider type leakage through `Session`, `User`, and `PostgrestError`;
- introduced provider-neutral Teswa backend contracts;
- introduced the Supabase adapter ownership/migration manifest;
- added a boundary checker that freezes new direct Supabase coupling;
- documented staged migration order;
- made no production/runtime cutover.

## Current inventory snapshot

- 65 direct Supabase client import files.
- 49 unique client RPC names.
- 11 feature-facing Auth methods plus 2 provider-shell auth lifecycle methods.
- 31 directly queried/mutated tables/views found in the client scan.
- 9 physical Storage buckets.
- 4 Realtime subscription call sites.
- 1 direct client Edge Function invoke.
- 5 Supabase Edge Function directories in the repo.
- 1 raw Supabase Storage REST upload path in Stories.

Detailed evidence:

- `docs/TESWA_BACKEND_DECOUPLING_INVENTORY_2026-09-03.md`
- `docs/TESWA_BACKEND_BOUNDARY_ARCHITECTURE_2026-09-03.md`

## Files owned/touched by this slice

Only new files were added.

Owned:

- `lib/backend/**`
- `scripts/check-backend-boundary.mjs`
- `docs/TESWA_BACKEND_DECOUPLING_INVENTORY_2026-09-03.md`
- `docs/TESWA_BACKEND_BOUNDARY_ARCHITECTURE_2026-09-03.md`
- this handoff

Not touched:

- existing screens/features/services;
- `package.json` / `package-lock.json`;
- Expo/native config;
- release workflows;
- Supabase migrations;
- Supabase functions;
- production environment/configuration.

## Validation performed

### Lane-local diff

Compared `14e7198...` -> `3954652...`:

- exactly one implementation commit;
- 17 added files;
- zero modified/deleted product/runtime files.

### Boundary allowlist

The current GitHub code scan returned 65 direct `@/lib/supabase/client` import files.

The checker allowlist also contains exactly 65 entries.

Validation result:

- missing from allowlist: 0;
- stale/extra allowlist entries: 0.

### Contract provider leakage

All new `lib/backend/contracts/**` files were scanned for:

- `Supabase`;
- `PostgREST`;
- `postgres_changes`;
- Supabase environment names;
- physical bucket names;
- representative RPC names.

Validation result: no provider leakage found in the contract layer.

### CI note

No workflow run was created by the architecture branch push.

A temporary Draft PR #477 was opened only to test PR-triggered validation, then immediately closed because this branch contains the wider 2026-09-03 commit chain relative to current `main`. The PR therefore showed unrelated Lane 0/product changes and was not a valid clean integration PR.

No merge/rebase was performed.

## Architecture decisions

1. Teswa contracts describe product behavior, never tables/RPCs/buckets.
2. Supabase-specific knowledge is allowed only inside the provider adapter area during migration.
3. Existing production Supabase services remain authoritative until each domain is migrated and parity-tested.
4. No generic database facade will be introduced.
5. Realtime becomes a Messaging contract capability; screens eventually create zero provider channels.
6. Media contracts use logical purposes rather than physical bucket names.
7. Provider-specific errors/types must be mapped before crossing into feature code.
8. OCI must implement the same Teswa contracts before any cutover.

## Remaining risks

- No concrete runtime adapter is active yet.
- Existing 65 direct imports remain legacy debt.
- Provider types still leak in current auth/notification service surfaces.
- Realtime remains directly owned by screens/services.
- Stories still contain the direct Supabase Storage REST upload path.
- The lane branch is not currently a clean PR against `main`; integration must wait for the correct integration base/handoff order.
- Full lint/typecheck was not automatically executed by CI for this branch push.

## Next slice

### B1 — Auth/session boundary

Target:

- implement a concrete Supabase Auth adapter behind `AuthContract`;
- map Supabase `Session/User` into Teswa-owned auth types;
- keep Supabase as the active provider;
- migrate auth consumers incrementally;
- preserve login/signup/Google/sign-out/account-gate behavior;
- no provider switch.

Do not begin production backend cutover in B1.
