# Teswa Backend Boundary — B8 Marketplace / Listing Progress

Date: 2026-09-03
Branch: `refactor/backend-boundary-20260903`

## B8.1 — Listing ownership and lifecycle

Migrated behind `MarketplaceCoreContract`:

- item likes read/write;
- My Listings aggregation;
- archive / reactivate / delete-archived lifecycle;
- pre-delete item image URL lookup.

## B8.2 — Edit Listing core

Migrated editable listing reads and core field/tag writes.

The feature layer retains:

- product validation;
- Arabic product-facing copy;
- manual-location-change semantics.

Provider table names and tag persistence are isolated in the Marketplace adapter.

## B8.3 — Edit Listing images

Media upload/remove stays behind `MediaStorageContract`.

Image metadata ownership now uses a provider-neutral listing image plan:

- current image context;
- new metadata insert;
- primary/sort-order updates;
- old metadata delete;
- storage cleanup of removed objects.

The feature layer keeps image optimization, upload progress, and rollback UX.

## B8.4 — Publish

Migrated:

- active category reads;
- item creation metadata;
- item image metadata;
- publish-failure archive;
- item-video metadata;
- wanted tags;
- failed-publish image metadata cleanup.

Media bytes remain behind the B2 Media boundary.

## B8.5 — Item video metadata

`lib/item-videos.ts` no longer performs direct provider reads.
Signed URL behavior remains through `MediaStorageContract`.

## B8.6 — Item discovery / motion reads

Migrated:

- exchange item summaries;
- item-video presence;
- recent video discovery moments;
- moving-item ranking/results;
- pulse item teaser metadata;
- new-marketplace-item count used by Personal Living World.

Provider-specific view/table/RPC details now live under the Marketplace adapter.

## Result

The primary Marketplace / listing / item-discovery surface is provider-free at feature level.

Remaining direct provider files after B8: 20.

Mixed Story/City Pulse surfaces are intentionally deferred to the Story/Discovery slice instead of forcing cross-domain logic into the Marketplace adapter.

No production provider switch or cutover was performed.
