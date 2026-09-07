# Teswa OCI Migration Verification Tooling

Branch: `migration/supabase-to-oci-20260903`

This directory belongs to Lane 4: Supabase -> OCI migration.

It does not provision OCI infrastructure and it does not refactor application
consumers. Lane 3 owns OCI infrastructure. Lane 2 owns the provider-independent
backend boundary.

## Safety contract

- Supabase remains the production authority until explicit cutover.
- Source capture is read-only.
- No script in this directory should apply DDL/DML to Supabase production.
- No credentials or generated manifests should be committed.
- A raw Supabase schema dump is evidence, not a portable OCI bootstrap.
- Provider-specific auth/storage/realtime/runtime behavior must be rebuilt or
  adapted deliberately before target authority.

## Current parallel-lane dependency snapshot

Observed on 2026-09-03:

### Lane 2 — Backend boundary

Branch: `refactor/backend-boundary-20260903`

Lane 2 has closed B1 Auth, B2 client Storage, B4 Offers/Deals, and B6
Notifications boundaries, while B3 Profile/Marketplace and B5
Messaging/Realtime have progressed substantially. Feature/client direct
Supabase Storage usage is 0. Supabase is still the active production provider.

Lane 4 may prepare source/target verification now. Production provider switching
must wait for the relevant Lane 2 boundary slices.

### Lane 3 — OCI platform

Branch: `infra/oracle-platform-20260903`

The isolated Teswa network foundation and durable Terraform state are green.

Lane 3 Phase 2 is also applied and verified:

- `teswa-media`: private, correct compartment;
- `teswa-backups`: private + versioned;
- `teswa-vault`: DEFAULT / ACTIVE;
- `teswa-ops`: ACTIVE;
- Terraform drift: none.

Lane 3 has additionally approved and preflighted a Nova resize to release
1 OCPU / 6 GB for Teswa, but the branch has not yet recorded that resize as
executed.

PostgreSQL, API, Realtime, workers, and production ingress are still not handed
to Lane 4.

## Files

### `capture-postgres-manifest.py`

Captures a deterministic JSON manifest from a PostgreSQL endpoint.

It records:

- public tables and RLS flags;
- columns;
- views;
- enums;
- indexes;
- constraints;
- structured foreign-key graph, including cross-schema auth/storage anchors;
- functions;
- triggers;
- public/storage policies;
- public publication tables;
- installed extensions;
- primary-key columns;
- per-table row counts;
- optional deep row and PK-set checksums;
- aggregate Supabase Auth counts/provider distribution when available;
- non-PII SHA-256 fingerprints of Auth/identity/profile UUID sets;
- aggregate Storage bucket/object metadata when available.

The PostgreSQL connection string is read from an environment variable and is
never written to the manifest.

Every psql child receives `default_transaction_read_only=on`.

Example source capture:

```bash
export TESWA_DATABASE_URL='postgresql://...'
python3 scripts/oci-migration/capture-postgres-manifest.py \
  --label supabase-source \
  --output /tmp/teswa-source.json \
  --deep
```

Example OCI target capture later:

```bash
export TESWA_DATABASE_URL='postgresql://...'
python3 scripts/oci-migration/capture-postgres-manifest.py \
  --label oci-shadow \
  --output /tmp/teswa-oci.json \
  --deep
```

### `compare-postgres-manifests.py`

Compares source and target manifests.

Hard gates by default:

- tables;
- columns;
- views;
- enums;
- indexes;
- constraints;
- row counts;
- row checksums when available;
- PK-set checksums when available.

Provider-runtime surfaces are reported separately because the OCI implementation
may intentionally replace Supabase internals while preserving Teswa behavior:

- functions;
- triggers;
- policies;
- publications;
- extensions;
- Supabase auth/storage provider metadata.

Example:

```bash
python3 scripts/oci-migration/compare-postgres-manifests.py \
  /tmp/teswa-source.json \
  /tmp/teswa-oci.json \
  --require-deep \
  --report /tmp/teswa-shadow-report.json
```

Use `--strict-provider-runtime` only for an environment where exact provider SQL
parity is intentionally expected.

### `capture-current-state-baseline.sh`

Captures the raw current Supabase public schema plus the machine-readable
manifest and the existing human-readable inventory.

Example:

```bash
export TESWA_SOURCE_DATABASE_URL='postgresql://...'
export TESWA_DEEP_CHECKSUMS=1
bash scripts/oci-migration/capture-current-state-baseline.sh
```

Default output is outside the repository under `/tmp`.

The resulting `public-schema.raw.sql` must not be applied blindly to OCI. It is
the authoritative source-side snapshot used to compile the portable target
baseline and to prove what was preserved/rebuilt.


### `plan-data-copy.py`

Builds a dependency-safe public-table load plan from a format-v2 PostgreSQL
manifest. It topologically orders public foreign-key dependencies, groups
cycles/self-references, surfaces cross-schema dependencies such as
`auth.users`, and reports tables without primary keys.

It never connects to a database and never disables constraints.

```bash
python3 scripts/oci-migration/plan-data-copy.py \
  /tmp/teswa-source.json \
  --output /tmp/teswa-data-copy-plan.json
```

### `capture-supabase-storage-manifest.py`

Captures object keys and byte sizes from `storage.buckets` /
`storage.objects` using a read-only PostgreSQL connection.

It does not download object bytes and therefore does not pretend provider ETags
are SHA-256 content proof.

```bash
export TESWA_SOURCE_DATABASE_URL='postgresql://...'
python3 scripts/oci-migration/capture-supabase-storage-manifest.py \
  --output /tmp/teswa-storage-source.json
```

### `compare-storage-manifests.py`

Compares normalized source/target storage manifests. Bucket/key identity and byte
size are hard gates. Once byte-hash collection exists on both sides,
`--require-content-sha256` makes exact SHA-256 equality a hard gate.

```bash
python3 scripts/oci-migration/compare-storage-manifests.py \
  /tmp/teswa-storage-source.json \
  /tmp/teswa-storage-oci.json \
  --report /tmp/teswa-storage-report.json
```

### `check-portable-baseline.py`

Scans `public-schema.raw.sql` and fails closed on provider-specific dependencies
such as Supabase Auth, Storage, Realtime, pg_net, Vault, cron, PostgREST JWT
request context, and Supabase database roles.

It deliberately does not rewrite SQL. Authorization/runtime behavior must be
classified and rebuilt explicitly instead of being weakened by search/replace.

```bash
python3 scripts/oci-migration/check-portable-baseline.py \
  /tmp/teswa-oci-source-baseline-*/public-schema.raw.sql \
  --report /tmp/teswa-portability-report.json
```

### `compile-portable-baseline.py`

Compiles a format-v3 source manifest into reviewed OCI baseline layers without
connecting to a database:

- `00-extensions.sql` — only portable PostgreSQL extensions;
- `10-structure.sql` — public enums + tables/columns;
- `20-integrity.sql` — non-FK constraints, indexes, views;
- `30-public-foreign-keys.sql` — public -> public FKs only;
- `rebuild-review.json` — RLS/auth/runtime/provider surfaces intentionally
  excluded from blind replay.

```bash
python3 scripts/oci-migration/compile-portable-baseline.py \
  /tmp/teswa-source.json \
  --output-dir /tmp/teswa-portable-baseline
```

### `capture-public-data-snapshot.sh`

Creates a transaction-consistent `pg_dump` custom archive for public application
data. The source session is forced read-only and the archive stays outside Git.

```bash
export TESWA_SOURCE_DATABASE_URL='postgresql://...'
bash scripts/oci-migration/capture-public-data-snapshot.sh
```

### `apply-initial-target-load.sh`

Applies the portable structure, restores the public-data archive, then applies
integrity/public-FK layers to an **empty isolated OCI PostgreSQL target**.

It is intentionally target-mutating and therefore requires all of:

- `TESWA_OCI_DATABASE_URL`;
- `TESWA_TARGET_ASSERT_HOST`;
- `TESWA_ALLOW_TARGET_WRITE=YES`.

It refuses Supabase-looking hosts and refuses a non-empty target public schema.

### `capture-identity-anchor.py` / `compare-identity-anchors.py`

Capture and compare non-PII SHA-256 fingerprints of identity UUID sets. This
lets Lane 4 prove UUID continuity even if OCI uses a different physical identity
table than Supabase `auth.users`.

### `export-supabase-storage-bytes.py`

Reads the storage metadata manifest, downloads the actual source objects using
server credentials from environment variables, and computes SHA-256 from the
bytes. It performs GETs only and never writes to Supabase Storage.

The resulting manifest is compatible with:

`compare-storage-manifests.py --require-content-sha256`.

### `validate-fk-orphans.py`

Runs read-only orphan checks for every captured FK. Public -> public FKs are
checked by default. External identity/storage anchors are included only with
`--include-external` after those target relations are intentionally ready.

### `upload-storage-to-oci.py` / `export-oci-storage-bytes.py`

The uploader writes only to **pre-created** OCI buckets and requires:

- `TESWA_ALLOW_TARGET_WRITE=YES`;
- `TESWA_OCI_STORAGE_ASSERTION=YES`;
- exact `TESWA_OCI_COMPARTMENT_OCID`;
- an explicit logical-source -> physical-target bucket map.

It refuses to create buckets. The target exporter then downloads OCI bytes and
computes SHA-256, so source hashes are never treated as target proof.

### Lane 3 Phase 2 Object Storage alignment

Lane 3 has applied and verified a private `teswa-media` application bucket and
a private/versioned `teswa-backups` bucket.

Lane 4's concrete media map is:

`oci-storage-bucket-map.phase2.json`

All nine logical source buckets map into `teswa-media` under isolated prefixes.

### `capture-cutover-bundle.sh` / `verify-cutover-bundle.py`

Capture and integrity-check a source evidence bundle containing:

- deep PostgreSQL manifest;
- raw current schema evidence;
- transaction-consistent public data archive;
- Auth UUID-set fingerprint;
- Storage metadata;
- optional Storage byte hashes.

Source actions are read-only.

### `archive-cutover-bundle-to-oci.py` / `verify-cutover-archive-in-oci.py`

After Lane 3 applies `teswa-backups`, these helpers can durably archive a
verified migration/cutover evidence bundle and re-download every archived object
to prove size + SHA-256 integrity.

The archiver requires:

- `TESWA_ALLOW_TARGET_WRITE=YES`;
- `TESWA_OCI_BACKUP_ASSERTION=YES`;
- expected Teswa compartment OCID;
- `NoPublicAccess`;
- Object Versioning `Enabled`.

### `compare-cutover-bundles.py`

Reports rehearsal -> final source drift across table counts/checksums, identity
fingerprints, and Storage object metadata. It does not invent an incremental
write path.

### `evaluate-cutover-readiness.py`

Aggregates structural/data/FK/identity/storage evidence with explicit semantic
gates. Production mode also requires source write freeze, final source bundle,
and routing-switch approval.

The fail-closed template is:

`cutover-semantic-gates.example.json`

### `classify-runtime-dependencies.py`

Classifies captured functions/policies/triggers into review queues such as
authorization, Storage, HTTP worker, secrets, scheduler, security-definer review,
or provider-neutral keep candidate. It never rewrites SQL.

### Semantic shadow tooling

`semantic-verification-scenarios.json` is the Lane-2 contract scenario catalog.

`compare-shadow-contract-results.py` compares normalized source/OCI contract
results while allowing only explicitly configured provider-volatile fields to
be ignored.

## Next execution gate

Lane 2 B1 Auth and B2 client Storage boundaries are now usable dependencies.

Lane 3 has handed Lane 4 the application Object Storage targets, but has **not
yet handed Lane 4 an isolated PostgreSQL target**.

When Lane 3 exposes an isolated PostgreSQL 17 target, Lane 4 should:

1. capture/verify a rehearsal source bundle;
2. classify runtime/provider dependencies;
3. compile the portable baseline;
4. apply it to a fresh empty OCI target;
5. capture target manifest;
6. run structural/data/FK validation;
7. copy + byte-hash Storage into pre-created OCI buckets;
8. verify identity UUID continuity;
9. exercise Lane-2 contract semantic scenarios;
10. run rollback rehearsal;
11. aggregate rehearsal readiness.

Production cutover uses the fresh-full-refresh strategy documented in
`docs/SUPABASE_TO_OCI_FINAL_REFRESH_STRATEGY_2026-09-03.md`.

No production source mutation is needed for any pre-cutover gate.
