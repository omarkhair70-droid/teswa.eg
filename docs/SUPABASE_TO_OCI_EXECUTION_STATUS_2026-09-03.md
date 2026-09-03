# Teswa Supabase -> OCI Lane 4 Execution Status

Date: 2026-09-03  
Branch: `migration/supabase-to-oci-20260903`

## Current cross-lane state

### Lane 2 — Backend boundary

Latest observed branch state:

- B1 Auth: closed
- B2 client Storage: closed
- B3 Profile/Marketplace: substantially progressed
- B4 Offers/Deals: closed
- B5 Messaging/Realtime: substantially progressed
- B6 Notifications: closed
- B7 Profile/Social: progressed, including profile setup/privacy/social graph/people/profile-image metadata
- Marketplace boundary has continued progressing, including listing/publish adapter closure
- Stories boundary work has started progressing as well

Supabase remains the active production provider.

### Lane 3 — OCI platform

Phase 2 is applied and green:

- `teswa-media`: private
- `teswa-backups`: private + versioning
- `teswa-vault`: ACTIVE
- `teswa-ops`: ACTIVE
- Terraform drift: none

Phase 3 compute is also applied and green:

- `teswa-edge-01`: RUNNING, E2 Micro, public edge
- `teswa-core-01`: RUNNING, A1 Flex, 1 OCPU / 6 GB, private
- NAT gateway: AVAILABLE
- Terraform drift: none

Phase 4 bootstrap preflight is green:

- both instances RUNNING
- Oracle Cloud Agent management/monitoring enabled
- Compute Instance Run Command plugin RUNNING

The first read-only guest OS inventory did **not** execute inside the guest: it
remained in OCI `ACCEPTED` until the client polling window expired.

Lane 3 diagnosed the missing instance-principal IAM path and has now:

- defined a Teswa-only dynamic group;
- defined least-privilege `instance-agent-command-execution-family` policy;
- produced a guarded saved Terraform plan;
- reviewed it as exactly 2 creates / 0 changes / 0 destroys;
- approved it for apply;
- added guarded apply + post-apply verifier helpers.

The IAM apply itself is not yet recorded as completed.

PostgreSQL is therefore **not installed/handed off yet**.

## Lane 4 execution state

### Ready now

The first real Storage migration rehearsal can run now because `teswa-media`
exists and is private.

Runner:

`scripts/oci-migration/run-storage-rehearsal.sh`

The runner performs:

1. read-only Storage metadata capture from Supabase;
2. GET-only download of all source objects;
3. source SHA-256 for every object;
4. guarded upload into `teswa-media`;
5. target re-download;
6. target SHA-256;
7. exact source/target parity gate.

It performs no Supabase writes and no OCI target deletes.

### Still blocked

Database rehearsal remains blocked until Lane 3:

1. installs PostgreSQL 17 privately on `teswa-core-01`;
2. creates an isolated empty Teswa rehearsal database;
3. provides the approved private/local execution path;
4. hands the target to Lane 4.

Lane 4 already has:

`scripts/oci-migration/preflight-oci-postgres-target.sh`

That gate will require:

- PostgreSQL major version 17;
- no public/wildcard listen address;
- port 5432;
- empty public schema;
- read-only verification before any initial load.

## Exact next sequence

### While Lane 3 closes Run Command IAM and continues Phase 4 OS/bootstrap

Lane 4:

1. runs Storage rehearsal when the required source credentials are available in
   the execution shell;
2. preserves all rehearsal evidence outside Git;
3. waits for PostgreSQL target handoff;
4. does not create/modify Lane 3 infrastructure.

### Immediately after PostgreSQL handoff

Lane 4 runs:

1. PostgreSQL target preflight;
2. source cutover/rehearsal bundle capture;
3. portable baseline compilation;
4. initial target load;
5. deep PostgreSQL source/target manifest comparison;
6. FK orphan validation;
7. identity UUID continuity;
8. Lane-2 contract semantic shadow checks;
9. rollback rehearsal;
10. rehearsal readiness aggregation.

Supabase remains authoritative throughout these steps.
