# Teswa Backend Boundary — B4 Offers / Deals Progress

Date: 2026-09-03  
Branch: `refactor/backend-boundary-20260903`

## Slice B4.1 — Offers lifecycle

Implemented:

- `OfferLifecycleContract`;
- `createSupabaseOfferLifecycleAdapter()`;
- `teswaBackendRuntime.offers`.

Migrated out of `lib/offers.ts`:

- item validation reads used by offer creation;
- incoming/sent offer reads;
- latest deal lookup per offer;
- offer action lookup;
- owned active-item ids;
- `mark_offer_thinking`;
- `soft_reject_offer`;
- `accept_offer`;
- offer insert;
- offer-created event insert.

Preserved in the feature layer:

- exchange state-machine validation;
- user block checks;
- item-summary enrichment;
- Arabic product-facing errors;
- notification payload semantics.

## Deliberately deferred

`lib/offers.ts` still performs `create_notification` through Supabase. Notification dispatch is a B6 Notifications boundary concern and is intentionally not hidden inside the Offers adapter.

The backend boundary checker now prevents offer lifecycle table/RPC calls from returning to `lib/offers.ts`.

No production provider switch was made.
