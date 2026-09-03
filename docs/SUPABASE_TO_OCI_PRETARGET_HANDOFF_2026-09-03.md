# Teswa Supabase -> OCI Lane 4 Pre-Target Handoff

Date: 2026-09-03  
Branch: `migration/supabase-to-oci-20260903`  
Parallel-plan base SHA: `14e7198ec42f33bf0fca781c0c5c0502c628b786`  
Implementation HEAD before this handoff document: `1efdcbb7b5b0804698c5697c6a2eb95a3996dbac`

## Status

**PRE-TARGET IMPLEMENTATION CLOSED / TARGET EXECUTION BLOCKED BY LANE 3 HANDOFF**

Lane 4 has completed the source audit, migration design, portable baseline
compiler, data/storage/identity verification tooling, cutover evidence tooling,
semantic shadow matrix, and rollback/cutover gating that can be built safely
before an OCI PostgreSQL/Object Storage application target exists.

Supabase remains production authority.

No destructive Supabase mutation has been performed.

## Source truth reconstructed

Current production facts verified read-only during this lane:

- 78 applied production migrations / 78 Git migration files;
- stale checked-in migration history reconciled;
- 46 public tables;
- 1 public view;
- 12 public enums;
- 188 public indexes;
- 249 public constraints;
- 80 public functions;
- 72 SECURITY DEFINER functions;
- 58 functions using `auth.uid()`;
- 23 public non-internal triggers;
- 99 public RLS policies;
- 29 Storage policies;
- all public tables have RLS enabled;
- 104 FKs originating from public tables;
- 83 public -> public FKs;
- 21 public -> `auth.users` FKs;
- 32 Auth users / identities / profiles at the audit watermark;
- 6 Realtime-published tables;
- 5 active Edge Functions;
- 1 active scheduled job;
- 9 Storage buckets;
- 154 Storage objects;
- 126,519,319 Storage bytes at repeated audit checks.

A later read-only sizing check estimated:

- ~5,566 public application rows;
- ~6,856,704 bytes of public relation footprint.

This supports a fresh full final refresh under a controlled write freeze rather
than inventing permanent dual-write/CDC for the first OCI cutover.

## Bootstrap gap closed at design/tooling level

Historical Git migrations cannot reconstruct an empty database because the
tracked chain begins after foundational objects already existed.

Lane 4 therefore does not invent missing history.

The target path is:

1. capture authoritative current source manifest;
2. compile a provider-neutral current-state baseline;
3. load an empty isolated PostgreSQL target;
4. restore application data;
5. add portable integrity/FKs;
6. rebuild Auth/RLS/RPC/runtime semantics deliberately.

## Data dependency result

The live FK graph contains two cyclic components:

- `items <-> offers`;
- `direct_messages.reply_to_message_id -> direct_messages.id`.

At the read-only audit watermark:

- `items.created_from_offer_id IS NOT NULL`: 0;
- `offers.parent_offer_id IS NOT NULL`: 0;
- `direct_messages.reply_to_message_id IS NOT NULL`: 0.

Initial snapshot load is therefore not currently blocked by populated cyclic
references, but the final procedure remains cycle-aware and does not assume
those counts stay zero.

## Lane 2 integration state observed

Latest observed Lane 2 work has:

- closed B1 Auth/session provider isolation;
- closed B2 client Storage provider isolation;
- reduced feature/client direct `supabase.storage` usage to 0;
- preserved Story upload progress through a provider-neutral media callback;
- started B3 Profile/Marketplace;
- introduced `ProfileReadContract` and migrated core profile reads.

Lane 4's semantic scenario catalog follows the current Teswa-owned contracts
rather than Supabase wire/internal contracts.

## Lane 3 integration state observed

Latest observed Lane 3 work has:

- closed isolated Teswa OCI network foundation;
- closed durable native OCI Terraform remote state;
- preserved Nova as a hard no-touch boundary;
- completed free-tier-specific capacity evaluation;
- selected a Phase 2 plan for a private `teswa-media` bucket, private/versioned
  `teswa-backups`, DEFAULT `teswa-vault`, and `teswa-ops` topic;
- not yet applied that Phase 2 plan.

Lane 4 has already mapped all nine logical source media buckets into the planned
private `teswa-media` bucket using prefix isolation.

Still not handed to Lane 4:

- isolated PostgreSQL 17 application target;
- an actually-applied `teswa-media` bucket;
- OCI API runtime;
- OCI Realtime runtime;
- worker/scheduler runtime;
- final secrets/runtime handoff required for semantic shadow.

Therefore no real source -> OCI database/storage copy has been executed yet.

## Files owned/touched by Lane 4

### Documentation

- `docs/SUPABASE_TO_OCI_MIGRATION_AUDIT_2026-09-03.md`
- `docs/SUPABASE_TO_OCI_DATA_COPY_PLAN_2026-09-03.md`
- `docs/SUPABASE_TO_OCI_MEDIA_CONTRACT_ALIGNMENT_2026-09-03.md`
- `docs/SUPABASE_TO_OCI_FINAL_REFRESH_STRATEGY_2026-09-03.md`
- `docs/SUPABASE_TO_OCI_SEMANTIC_VERIFICATION_MATRIX_2026-09-03.md`
- this handoff

### Source capture / inventory

- `scripts/supabase-to-oci-readonly-inventory.sql`
- `scripts/oci-migration/capture-current-state-baseline.sh`
- `scripts/oci-migration/capture-postgres-manifest.py`
- `scripts/oci-migration/capture-public-data-snapshot.sh`
- `scripts/oci-migration/capture-supabase-storage-manifest.py`
- `scripts/oci-migration/export-supabase-storage-bytes.py`
- `scripts/oci-migration/capture-identity-anchor.py`
- `scripts/oci-migration/capture-cutover-bundle.sh`
- `scripts/oci-migration/verify-cutover-bundle.py`

### Baseline/data planning

- `scripts/oci-migration/check-portable-baseline.py`
- `scripts/oci-migration/classify-runtime-dependencies.py`
- `scripts/oci-migration/compile-portable-baseline.py`
- `scripts/oci-migration/plan-data-copy.py`
- `scripts/oci-migration/apply-initial-target-load.sh`
- `scripts/oci-migration/validate-fk-orphans.py`

### Source/target parity

- `scripts/oci-migration/compare-postgres-manifests.py`
- `scripts/oci-migration/compare-identity-anchors.py`
- `scripts/oci-migration/compare-storage-manifests.py`
- `scripts/oci-migration/compare-cutover-bundles.py`

### OCI Storage target tooling

- `scripts/oci-migration/media-purpose-map.json`
- `scripts/oci-migration/upload-storage-to-oci.py`
- `scripts/oci-migration/export-oci-storage-bytes.py`

### Semantic/cutover gates

- `scripts/oci-migration/semantic-verification-scenarios.json`
- `scripts/oci-migration/compare-shadow-contract-results.py`
- `scripts/oci-migration/cutover-semantic-gates.example.json`
- `scripts/oci-migration/evaluate-cutover-readiness.py`
- `scripts/oci-migration/README.md`

### Snapshot reconciliation

- `supabase/PRODUCTION_MIGRATION_HISTORY.txt`

No Lane 2 or Lane 3 owned implementation file was modified.

## Safety properties implemented

### Source

- no DDL/DML helper against Supabase;
- source PostgreSQL helpers force `default_transaction_read_only=on`;
- Storage source byte exporter performs GETs only;
- secrets/connection strings are environment-only;
- generated production-data artifacts default outside Git.

### Target

Target-mutating helpers fail closed.

Initial PostgreSQL load requires:

- `TESWA_ALLOW_TARGET_WRITE=YES`;
- explicit expected OCI PostgreSQL hostname;
- non-Supabase hostname;
- empty public target schema.

OCI Storage upload requires:

- `TESWA_ALLOW_TARGET_WRITE=YES`;
- `TESWA_OCI_STORAGE_ASSERTION=YES`;
- exact expected Teswa compartment OCID;
- explicit logical bucket -> physical bucket map;
- pre-created buckets.

Lane 4 does not create/reset/delete target databases or buckets automatically.

## Verification design implemented

### PostgreSQL

- tables/columns/enums/views/indexes/constraints;
- structured FK graph;
- public -> public parity separated from external provider FKs;
- row counts;
- deterministic deep row checksums;
- primary-key-set checksums;
- FK orphan validation.

### Identity

- count + SHA-256 UUID-set fingerprints;
- no user UUIDs emitted by identity comparison artifacts.

### Storage

- logical bucket/key manifest;
- size checks;
- source actual-byte SHA-256;
- guarded OCI upload;
- OCI actual-byte re-download + SHA-256;
- exact source/target hash comparison.

### Semantic behavior

Contract-level scenario catalog includes:

- Auth;
- all nine media purposes;
- Profile;
- Marketplace;
- Offers/Deals;
- Messaging/Realtime;
- Notifications;
- push/smart-reminder workers;
- account deletion rehearsal.

Generic comparison supports only explicitly declared provider-volatile field
normalization.

## Cutover decision

The selected first production cutover is:

`Supabase authority -> OCI rehearsal/shadow -> controlled write freeze -> fresh final source bundle -> fresh empty OCI cutover DB -> full verification -> provider routing switch`

Not:

- permanent dual write;
- blind `pg_dump` restore of Supabase internals;
- destructive source shutdown;
- automated target truncate/reset.

## Validation completed so far

- live production catalog/source audit: read-only;
- migration list vs Git reconciliation;
- live FK graph reconstruction;
- repeated Storage count/byte verification;
- live cycle-reference population checks;
- live database sizing check;
- Lane 2 contract dependency rechecks;
- Lane 3 platform dependency rechecks;
- branch stayed isolated from Lane 2/3 implementation ownership.

Target-execution validation is intentionally **not claimed** because Lane 3 has
not handed off a PostgreSQL/Object Storage application target yet.

## Remaining risks / blockers

1. OCI PostgreSQL target does not yet exist for Lane 4 execution.
2. OCI media bucket layout is selected but the Phase 2 `teswa-media` bucket is not yet applied/handed off.
3. External Auth-equivalent identity FKs are deliberately unapplied.
4. RLS/RPC authorization semantics still require OCI/Lane-2 runtime implementation.
5. Realtime runtime parity is unexecuted.
6. notification/smart-reminder/account-deletion worker parity is unexecuted.
7. no real OCI Storage byte copy has been run.
8. no rollback drill has been run.
9. no production routing switch is approved.
10. no source write freeze is active.

These are blockers, not waived TODOs.

## Exact next Lane 4 execution

When Lane 3 provides an isolated PostgreSQL 17 target:

1. capture rehearsal cutover bundle from source;
2. verify bundle integrity;
3. classify runtime dependencies;
4. compile portable baseline;
5. apply baseline/data to the empty OCI target;
6. capture OCI deep manifest;
7. compare PostgreSQL parity;
8. validate public FK orphan state;
9. connect reviewed identity anchor and prove UUID continuity;
10. copy Storage into pre-created OCI buckets;
11. re-download/hash OCI bytes and prove exact parity;
12. execute Lane-2 semantic scenario matrix;
13. execute rollback rehearsal;
14. evaluate rehearsal cutover readiness.

Only after those pass should a production final-refresh window be considered.

## Integration dependencies

### Lane 2

Consume current/future Teswa-owned contracts and adapters. Do not merge Lane 4
migration transport into feature code.

Required before provider authority switch:

- completed relevant Profile/Marketplace boundary;
- Offers/Deals boundary;
- Messaging/Realtime boundary;
- Notifications/remaining runtime boundaries;
- centralized provider selection/API seam.

### Lane 3

Required for Lane 4 execution:

- isolated PostgreSQL 17 endpoint/database;
- application Object Storage bucket plan;
- OCI API runtime;
- Realtime;
- workers/scheduler;
- secrets;
- backup/restore;
- observability/health.

## Merge discipline

Do not merge this branch directly to `main`.

Integration should cherry-pick/review Lane 4 only after Lane 2 and Lane 3
handoffs define the actual provider/runtime target and the target-execution
validation above has been performed.
