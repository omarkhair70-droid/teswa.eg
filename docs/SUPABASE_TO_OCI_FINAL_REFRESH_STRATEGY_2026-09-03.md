# Teswa OCI Final Refresh / Cutover Data Strategy

Date: 2026-09-03  
Branch: `migration/supabase-to-oci-20260903`

## Decision

For the current Teswa scale, Lane 4 chooses a **fresh full final refresh under a
controlled write freeze** instead of inventing a permanent dual-write or generic
CDC/delta system for the first OCI cutover.

This is an operational cutover decision, not a claim that CDC is never useful
later.

## Why this is the safer first cutover

Fresh read-only production measurement on 2026-09-03:

- public tables: 46;
- estimated public rows: ~5,566;
- total public table/index relation footprint: ~6,856,704 bytes (~6.5 MiB);
- Storage: 154 objects / 126,519,319 bytes (~120.7 MiB).

The database application data is therefore small enough that a complete
transaction-consistent final PostgreSQL snapshot is simpler and safer than
writing bespoke per-table incremental logic across:

- 104 FKs;
- two current cyclic FK components;
- 21 Auth-anchored FKs;
- 80 public functions;
- trigger side effects;
- realtime/message state.

A full refresh also avoids a dangerous long-lived dual-authority period.

## Rehearsal shape

Before production cutover:

1. capture a rehearsal source bundle;
2. compile the portable baseline;
3. load it into an empty isolated OCI PostgreSQL database;
4. copy/hash Storage to pre-created OCI buckets;
5. verify schema/data/FKs/identity/storage;
6. run Auth/RPC/media/realtime/worker semantic tests;
7. run rollback drill;
8. keep Supabase authoritative.

## Production cutover shape

When all rehearsal gates are green:

1. enter a controlled Teswa write freeze/maintenance boundary;
2. confirm no new application writes are being accepted;
3. run `capture-cutover-bundle.sh` with deep DB checksums;
4. include source Storage byte hashes, or re-use a pre-copied byte set plus a
   final metadata/object drift capture and upload any changed objects;
5. use a **fresh empty OCI cutover database** rather than destructively clearing
   the working shadow database;
6. compile/apply the final portable baseline;
7. restore the final public-data archive;
8. attach/validate reviewed identity anchors and provider/runtime behavior;
9. capture OCI deep manifest;
10. compare source vs OCI;
11. validate FK orphans;
12. compare identity UUID fingerprints;
13. download/hash target Storage and require exact byte parity;
14. run semantic smoke;
15. evaluate `evaluate-cutover-readiness.py --mode production`;
16. only then switch provider routing;
17. keep Supabase intact through the rollback window.

## Why a fresh cutover database

Lane 4 deliberately does not add an automated `DROP/TRUNCATE production target`
script.

Using a fresh empty database means:

- the rehearsal/shadow target remains evidence;
- no stale shadow row can leak into final authority;
- final restore has a clean precondition;
- rollback/review is easier;
- a mistaken target reset cannot destroy the only OCI copy.

Lane 3 should hand Lane 4 an explicitly isolated empty PostgreSQL target for the
final rehearsal/cutover load.

## Storage final-sync rule

The 120.7 MiB media set can be copied before write freeze.

At final freeze:

- recapture Storage metadata;
- compare rehearsal/final bundles with `compare-cutover-bundles.py`;
- copy new/changed objects;
- remove target-only stale objects only through an explicit reviewed target
  cleanup step if parity requires it;
- download/hash OCI target bytes;
- require `compare-storage-manifests.py --require-content-sha256` to pass.

Source Storage is never deleted during cutover preparation.

## Rollback consequence

Supabase remains unchanged and authoritative until routing is switched.

If post-switch smoke fails:

1. stop accepting OCI-authoritative writes;
2. capture any OCI-only writes accepted after switch;
3. reconcile those writes before returning authority to Supabase;
4. route clients/backend back to Supabase;
5. do not destroy the failed OCI target; preserve it as incident evidence.

The exact post-switch write reconciliation path must be rehearsed before the
`rollback_drill_verified` semantic gate becomes true.

## No fake green

The following are insufficient by themselves:

- schema restored successfully;
- row counts match;
- app opens;
- one login succeeds.

Production cutover additionally requires identity, authorization/RPC semantics,
media access, realtime, workers/notifications, Storage byte parity, rollback
drill, and routing/freeze gates.
