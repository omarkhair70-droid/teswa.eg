# Teswa Supabase -> OCI Lane 4 Execution Status

Date: 2026-09-04  
Branch: `migration/supabase-to-oci-20260903`

## Current cross-lane state

### Lane 2 — Backend boundary

Lane 2 has issued its final provider-boundary handoff.

Observed final state:

- backend decoupling implementation complete for the current Teswa feature surface;
- feature-level direct `@/lib/supabase/client` allowlist: `0`;
- boundary guard: PASS;
- TypeScript validation: PASS;
- Teswa feature code reaches backend capabilities through `teswaBackendRuntime`
  and Teswa-owned contracts;
- Supabase remains the active production adapter;
- no OCI cutover or production data migration was performed by Lane 2.

For Lane 4 there is no new Lane 2 dependency for the read-only PostgreSQL
rehearsal entry gates. Contract-level semantic parity will consume the completed
Lane 2 handoff later.

### Lane 3 — OCI platform

Phase 2 and Phase 3 remain green:

- `teswa-media`: private;
- `teswa-backups`: private + versioning;
- `teswa-vault`: ACTIVE;
- `teswa-ops`: ACTIVE;
- `teswa-core-01`: RUNNING, private A1 Flex, 1 OCPU / 6 GB;
- `teswa-edge-01`: RUNNING, E2 Micro public edge;
- Terraform drift: none.

Lane 3 completed and handed off the PostgreSQL 17 rehearsal target.

Verified target state:

- host: `teswa-core-01`;
- PostgreSQL: native PGDG 17;
- service: active/enabled and runtime-verified;
- listen address: `127.0.0.1` only;
- port: `5432`;
- rehearsal database: `teswa_rehearsal`;
- public relations: `0`;
- firewall TCP/5432 exposure: `false`;
- application/migration credentials created: `false`;
- production data migrated: `none`;
- production cutover: `none`;
- verified gate: `postgres17_bootstrap=PASS`.

PostgreSQL remains localhost-only. Lane 4 uses the existing controlled OCI Run
Command path on `teswa-core-01` for target-local inspection until a separate
private-network access change is explicitly reviewed.

## Dependency decision before mutation

### Read-only entry gates

No additional Lane 2 dependency is required.

No additional Lane 3 infrastructure dependency is required because:

- the PostgreSQL target is GREEN;
- Run Command is operational;
- localhost-only PostgreSQL is the reviewed target boundary.

The only execution prerequisite is a read-only Supabase PostgreSQL source URL in
the operator environment. It must not be committed or pasted into repository
output.

### Before any future target mutation/data load

Lane 4 must stop and require an explicit reviewed execution boundary for:

1. delivering compiled baseline/data material onto `teswa-core-01` without
   exposing PostgreSQL publicly;
2. confirming `teswa_rehearsal` is still empty immediately before the load;
3. an explicit rehearsal-only target-write acknowledgement;
4. credential/role creation, if later required, through a reviewed host-local or
   Vault-backed boundary rather than ad-hoc production credentials.

No such mutation is authorized by this status document.

## Lane 4 read-only implementation

### Target verification

`scripts/oci-migration/run-target-preflight-via-oci.sh`

Re-verifies the Lane 3 target using OCI Run Command and local PostgreSQL access.
It hard-gates PostgreSQL 17, localhost-only listener, SCRAM, empty
`teswa_rehearsal`, no unexpected user schema, and closed firewall 5432.

Expected gate:

`lane4_postgres_target_preflight=PASS`

### Source rehearsal preparation

`scripts/oci-migration/prepare-rehearsal-readonly.sh`

Performs only source read-only schema/catalog capture and offline compilation of:

- provider-neutral structural baseline;
- FK-aware copy plan;
- runtime/provider dependency classification;
- evidence SHA-256 manifest.

It intentionally does not create a public-data archive, restore data, copy
Storage bytes, create credentials, or mutate the OCI target.

### Audited structural invariant gate

`scripts/oci-migration/verify-source-structural-invariants.py`

New fail-closed offline gate. It requires the source structural baseline still
matches the audited migration model before any target write is considered:

- 46 public tables;
- 1 public view (`marketplace_items`);
- 12 public enums;
- 188 indexes;
- 249 constraints;
- 104 public-origin FKs = 83 public->public + 21 external;
- all 21 external FKs still anchor only to `auth.users`;
- 46 primary-key-bearing public tables;
- all public source tables still RLS-enabled;
- 80 public functions;
- 23 non-internal public triggers;
- 99 public policies;
- 29 storage policies;
- the six audited public Realtime publication tables;
- 9 logical Storage buckets;
- no unexpected public identity/generated/sequence-backed columns;
- source PostgreSQL major 17.

Dynamic user/object/row counts are deliberately not hard-coded by this
structural gate.

Expected gate:

`lane4_source_structural_gate=PASS`

### Combined entry runner

`scripts/oci-migration/run-lane4-entry-readonly-gates.sh`

This is now the single safe entry command for the handoff. It:

1. verifies the OCI PostgreSQL target in place;
2. captures current Supabase source structural evidence read-only;
3. compiles the portable baseline and dependency plans offline;
4. runs the audited structural invariant gate;
5. writes SHA-256 evidence under `/tmp`.

It fails closed if target/data-load/cutover write opt-ins are present in the
shell, so it cannot be mistaken for the rehearsal load command.

Expected final gate:

`lane4_entry_readonly_gates=PASS`

## Current execution boundary

The next execution is the combined read-only entry runner only.

Only after its evidence is GREEN should Lane 4 design/review the first
**target-mutating rehearsal load**. That later load remains a separate gate and
is not production cutover.

## Still forbidden

- production cutover;
- Supabase shutdown;
- production write freeze;
- production DNS switch;
- public PostgreSQL;
- arbitrary production credentials;
- blind replay of Supabase provider SQL;
- source data mutation;
- target data load before the read-only entry evidence is reviewed.
