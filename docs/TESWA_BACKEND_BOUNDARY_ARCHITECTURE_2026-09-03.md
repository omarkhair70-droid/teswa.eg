# Teswa Backend Boundary Architecture

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Goal

Move Teswa from:

`Screen / feature -> Supabase SDK / RPC / table / bucket / Realtime`

to:

`Screen / feature -> Teswa domain contract -> active provider adapter -> backend`

without changing the production provider during this lane.

## Non-goals for this phase

- No Supabase -> OCI production cutover.
- No database migration.
- No auth migration.
- No storage object migration.
- No broad rewrite of working feature code.
- No release configuration changes.
- No generic database facade that exposes tables/RPCs under a new name.

## Design rule: Teswa owns behavior, providers own transport

A domain contract should describe what Teswa needs:

- `marketplace.getById(itemId)`
- `offersDeals.accept(offerId, userId)`
- `messaging.subscribe(conversationId, listener)`
- `media.getSignedUrl(object)`

It must not describe how Supabase happens to implement it:

- `from('items')`
- `rpc('accept_offer')`
- `storage.from('item-images')`
- `channel(...).on('postgres_changes', ...)`

That distinction is what makes an OCI adapter possible later.

## Contract tree introduced

```text
lib/backend/
  contracts/
    core.ts
    auth.ts
    profile.ts
    marketplace.ts
    offers-deals.ts
    messaging.ts
    media.ts
    notifications.ts
    analytics.ts
    index.ts
  adapters/
    supabase/
      adapter-manifest.ts
      README.md
  teswa-backend.ts
  index.ts
```

`TeswaBackend` is the aggregate capability contract. It is not wired into runtime yet.

## Provider isolation rules

### Contracts may contain

- Teswa IDs
- domain DTOs
- domain actions
- domain failure reasons
- provider-neutral subscription states
- logical media purposes

### Contracts may not contain

- `SupabaseClient`
- `Session`, `User`, `PostgrestError`
- table/view names
- RPC names
- Storage bucket names
- Supabase Realtime status strings
- `EXPO_PUBLIC_SUPABASE_*`
- Supabase REST URLs

### Supabase adapter area may contain

All of the above provider-specific details, but it must translate them into Teswa-owned contract types before returning values to feature code.

## Why there is no runtime adapter implementation yet

The current production services contain domain logic and provider calls interleaved in the same functions. Writing a second implementation immediately would duplicate behavior and increase regression risk.

The safe sequence is:

1. inventory current behavior;
2. define the Teswa contract;
3. extract provider mapping for one domain;
4. keep Supabase as the active adapter;
5. move consumers to the contract;
6. validate parity;
7. only then delete the old direct path.

This lane is currently at steps 1-2 globally.

## Adapter migration order

### B0 — Boundary freeze

Status: started.

- inventory direct dependencies;
- add Teswa contracts;
- freeze new direct Supabase imports with the allowlist checker;
- no runtime behavior change.

### B1 — Auth/session boundary

First runtime migration candidate.

Reason:
- Supabase `Session/User` leak is cross-cutting.
- Auth identity/session types affect most future adapters.
- Account deletion and Google auth should consume a Teswa auth capability, not Supabase directly.

Acceptance:
- `AuthContextValue` exposes Teswa auth types only;
- auth screens import no Supabase client;
- Google auth modules call `AuthContract`;
- production login/signup/sign-out behavior remains identical.

### B2 — Media/storage boundary

- logical media purpose -> physical provider location mapping;
- remove bucket knowledge from feature code;
- move story raw REST upload behind media adapter;
- preserve upload progress behavior.

Acceptance:
- no feature knows bucket names;
- signed/public URL behavior remains equivalent;
- cleanup/rollback behavior remains equivalent.

### B3 — Profile + marketplace reads

- profiles/people/trust/follows;
- marketplace feed/detail/nearby;
- listing display joins and view mappings.

Acceptance:
- feature code sees Teswa DTOs, not PostgREST rows;
- cache/offline behavior remains unchanged;
- no table/view names in migrated feature surfaces.

### B4 — Offers/deals lifecycle

- offer create/thinking/reject/accept;
- deal room/read/confirmation;
- lifecycle RPCs become adapter implementation details.

Acceptance:
- contract preserves all authorization/status error semantics;
- no duplicate writes/notifications;
- existing Supabase RPC path remains the active adapter.

### B5 — Messaging + Realtime

Highest-risk migration.

- inbox;
- direct chat;
- contextual/story replies;
- deal message subscriptions;
- typing/reactions/attachments;
- channel status mapping.

Acceptance:
- screens create zero Supabase channels;
- Realtime tables/events are adapter-private;
- reconnect/offline UX still works;
- no duplicate messages/events.

### B6 — Notifications + analytics + remaining domains

- notifications/preferences/push registration;
- analytics;
- admin/reporting;
- Dolab;
- stories discovery/social helpers;
- policy acceptance.

## Composition root

Do not add a production composition root until the first concrete Supabase domain adapter is ready.

Target shape later:

```text
Teswa feature
  -> TeswaBackend.<domain>
      -> createSupabase...Adapter(...)   # current production
      -> createOci...Adapter(...)        # future shadow/non-prod
```

The provider switch must be centralized. A screen must never select between Supabase and OCI.

## Shadow migration readiness

The contracts are intentionally provider-neutral so Lane 3/4 can implement OCI capabilities behind the same boundary.

Before any provider switch:

1. run Supabase and OCI reads in shadow where safe;
2. compare IDs/counts/ordering/authorization outcomes;
3. compare signed-media behavior;
4. compare message/realtime delivery semantics;
5. compare write side effects in a controlled non-production environment;
6. prove rollback;
7. only then allow a gated provider selection.

## Boundary checker

Run manually:

```bash
node scripts/check-backend-boundary.mjs
```

It does not require existing debt to disappear. It freezes the current direct-import set and fails only when new source files introduce fresh Supabase client/provider/env coupling outside the allowed adapter area.

It is intentionally not wired into `package.json` or CI in this commit to avoid touching Lane 0 release-owned configuration.

## Ownership / integration notes

Owned by Backend Decoupling lane:

- `lib/backend/**`
- `scripts/check-backend-boundary.mjs`
- backend decoupling docs

Not changed in this architecture slice:

- `package.json`
- Expo/native config
- Supabase migrations/functions
- existing app screens/services
- production environment
- release workflows

## Exit criteria for this initial architecture slice

- [x] Read parallel lane plan.
- [x] Inventory all current direct Supabase client imports.
- [x] Inventory RPC/Auth/Storage/Realtime/Edge Function coupling.
- [x] Identify provider type leakage.
- [x] Define Teswa-owned domain contracts.
- [x] Define Supabase adapter ownership/manifest.
- [x] Freeze new direct coupling without changing runtime.
- [ ] Implement first concrete adapter (Auth) in a dedicated follow-up slice.
- [ ] Migrate consumers.
- [ ] Remove any legacy direct import.
- [ ] Perform production provider cutover — explicitly out of scope.
