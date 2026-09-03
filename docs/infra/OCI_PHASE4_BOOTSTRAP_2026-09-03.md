# Teswa OCI Phase 4 Bootstrap — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Status:** PREFLIGHT GREEN — READ-ONLY OS INVENTORY NEXT

## Goal

Prepare the two new Teswa hosts for the future company-owned runtime without moving production traffic yet.

## Hosts

### teswa-edge-01

Future responsibilities:

- Caddy/TLS
- reverse proxy
- edge health endpoint
- no database
- no application secrets in Terraform

### teswa-core-01

Future responsibilities:

- PostgreSQL
- Teswa API
- Realtime
- Workers

These remain separate service/restart boundaries even though they initially share one A1 host.

## Bootstrap sequence

1. Verify Oracle Cloud Agent and Compute Instance Run Command on both hosts.
2. Collect read-only OS/runtime inventory.
3. Apply OS baseline and package updates through Run Command.
4. Install container/runtime prerequisites.
5. Bootstrap PostgreSQL privately.
6. Bootstrap API / Realtime / Worker service units or containers.
7. Bootstrap Caddy on edge.
8. Add monitoring/logging.
9. Add backup/restore jobs.
10. Run internal smoke tests.

## Still forbidden

- no Supabase shutdown
- no production cutover
- no DNS switch
- no migration of live user data
- no public PostgreSQL
- no public SSH requirement
- no secrets printed in Run Command output

The first Phase 4 action is read-only readiness verification only.


## Preflight result

Both Teswa instances passed the Oracle Cloud Agent readiness gate:

- `teswa-core-01`: RUNNING
- `teswa-edge-01`: RUNNING
- management enabled
- monitoring enabled
- plugins enabled
- Compute Instance Run Command: RUNNING
- Compute Instance Monitoring: RUNNING
- `phase4_preflight=PASS`

The next step is a read-only guest OS inventory through Run Command. No package installation or guest OS mutation is included yet.
