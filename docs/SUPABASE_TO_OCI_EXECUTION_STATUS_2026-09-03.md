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

For Lane 4 this means there is **no new Lane 2 dependency required for the
read-only PostgreSQL rehearsal entry checks**. Contract-level semantic parity
will consume the completed Lane 2 handoff later.

### Lane 3 — OCI platform

Phase 2 and Phase 3 remain green:

- `teswa-media`: private;
- `teswa-backups`: private + versioning;
- `teswa-vault`: ACTIVE;
- `teswa-ops`: ACTIVE;
- `teswa-core-01`: RUNNING, private A1 Flex, 1 OCPU / 6 GB;
- `teswa-edge-01`: RUNNING, E2 Micro public edge;
- Terraform drift: none.

Lane 3 has now completed and handed off the PostgreSQL 17 rehearsal target.

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

PostgreSQL is intentionally localhost-only. Lane 4 must therefore use the
existing controlled OCI Run Command path on `teswa-core-01` for target-local
inspection/rehearsal work unless a separate private-network database-access
change is reviewed later.

## Dependency decision before mutation

### Read-only steps now

No additional Lane 2 dependency is required.

No additional Lane 3 infrastructure dependency is required for the target
read-only preflight because:

- the target is GREEN;
- Run Command is operational;
- localhost-only PostgreSQL is the reviewed target boundary.

### Before any future target mutation/data load

Lane 4 must stop and require an explicit reviewed execution boundary for:

1. delivering the compiled baseline/data material onto `teswa-core-01` without
   exposing PostgreSQL publicly;
2. confirming `teswa_rehearsal` is still empty immediately before the load;
3. an explicit rehearsal-only target-write acknowledgement;
4. credential/role creation, if later needed, through a reviewed host-local or
   Vault-backed boundary rather than ad-hoc production credentials.

No such mutation is authorized by this status document.

## Lane 4 safe work started

### Target read-only verification

Added:

`scripts/oci-migration/run-target-preflight-via-oci.sh`

This re-verifies the Lane 3 handoff from Lane 4 using OCI Run Command and local
`sudo -u postgres psql` only.

It hard-gates:

- PostgreSQL major 17;
- active `postgresql-17` service;
- `listen_addresses=127.0.0.1`;
- `port=5432`;
- `password_encryption=scram-sha-256`;
- `teswa_rehearsal` exists;
- public relations = 0;
- no unexpected user schema;
- firewalld 5432 remains closed.

It performs:

- no schema mutation;
- no row mutation;
- no data transfer;
- no credential creation;
- no production cutover.

Expected terminal gate:

`lane4_postgres_target_preflight=PASS`

### Source/read-only rehearsal preparation

Added:

`scripts/oci-migration/prepare-rehearsal-readonly.sh`

This intentionally stops before any application-data archive or target load.

It performs only:

1. read-only source schema/catalog capture;
2. raw portability hazard report;
3. offline provider-neutral baseline compilation;
4. offline FK-aware data-copy planning;
5. offline runtime/provider dependency classification;
6. SHA-256 evidence manifest generation.

It explicitly does **not** perform:

- `pg_dump --data-only`;
- `pg_restore`;
- Storage object transfer;
- OCI database writes;
- role/password creation;
- source mutation;
- production write freeze/cutover.

## Current execution boundary

The next safe sequence is now:

1. run Lane 4 target preflight via OCI Run Command;
2. run source read-only rehearsal preparation;
3. review the resulting portable baseline, FK plan, and runtime dependency queue;
4. compare those findings against the Lane 2 final contract handoff and Lane 3
   localhost-only target boundary;
5. only then design the first target-mutating rehearsal load gate.

No production data transfer or provider switch is part of the current step.

## Still forbidden

- production cutover;
- Supabase shutdown;
- production write freeze;
- production DNS switch;
- public PostgreSQL;
- arbitrary production credentials;
- blind replay of Supabase provider SQL;
- source data mutation;
- target data load before a separately reviewed rehearsal mutation gate.
