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

The branch has introduced Teswa-owned contracts and the concrete Supabase Auth
adapter. Email login/signup, AuthProvider session ownership, Google browser/native
auth, and the remaining feature-level auth SDK calls now route through the Teswa
Auth boundary. Media, marketplace, offers/deals, messaging/realtime, and
notification consumer migration is still in progress.

Lane 4 may prepare source/target verification now. Production provider switching
must wait for the relevant Lane 2 boundary slices.

### Lane 3 — OCI platform

Branch: `infra/oracle-platform-20260903`

The isolated Teswa OCI foundation has been applied: a Teswa compartment, VCN,
public edge subnet, private app subnet, private data subnet, NSGs, route policy,
and internet gateway. The existing Nova A1 VM remains a hard no-touch boundary.

The isolated network foundation is applied and reports no Terraform drift. The
final zero-compute verification is still being closed. PostgreSQL, API, Realtime,
workers, Object Storage, Vault, and production ingress are not yet provisioned
as the Teswa data plane.

Lane 4 therefore cannot execute a real source -> OCI shadow comparison yet, but
can finish the capture/comparison machinery now.

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

## Next execution gate

When Lane 3 exposes an isolated PostgreSQL 17 target, Lane 4 should:

1. capture a source manifest at a defined watermark;
2. compile/apply the portable current-state baseline to the isolated target;
3. capture the target manifest;
4. run the structural comparator;
5. copy application data in dependency-safe order;
6. capture both sides again with `--deep`;
7. run deep data comparison;
8. exercise auth/RPC/storage/realtime semantic verification through Lane 2
   contracts;
9. block cutover on any unexplained hard-gate or behavior drift.

No production source mutation is needed for any of these pre-cutover gates.
