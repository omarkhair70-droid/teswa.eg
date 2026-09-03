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


## Run Command ACCEPTED timeout diagnosis

The first read-only OS inventory command remained in `ACCEPTED` for the full client polling window and never reached `IN_PROGRESS`.

This indicates that the guest script itself did not start.

Oracle documents this behavior when the instance can run the plugin but is not authorized to poll its command execution through a dynamic group and `instance-agent-command-execution-family` policy. New dynamic-group membership can take up to 30 minutes to become effective.

The repository previously enabled the Run Command plugin but did not create this instance-principal IAM path.

Remediation:

1. create a Teswa-only dynamic group matching instances in `teswa-platform`;
2. grant only `use instance-agent-command-execution-family` in `teswa-platform`, restricted to the target instance;
3. wait for IAM/dynamic-group propagation;
4. retry a read-only Run Command before any bootstrap mutation.


## Run Command IAM plan review

Read-only diagnosis confirmed:

- no existing `teswa-run-command-instances` dynamic group
- no existing `teswa-run-command-policy`
- the core inventory command remained `ACCEPTED`
- edge had no pending accepted command

The saved Terraform IAM plan was reviewed:

- 2 creates
- 0 changes
- 0 destroys
- `phase4_iam_plan_guard=PASS`

Approved resources:

1. root-tenancy dynamic group `teswa-run-command-instances`, matching instances in the dedicated `teswa-platform` compartment;
2. root policy `teswa-run-command-policy`, granting only `use instance-agent-command-execution-family` in `teswa-platform` with `request.instance.id=target.instance.id`.

The policy statement matches Oracle's documented Run Command instance-principal requirement.

No compute, network, storage, DNS, database, Nova, or Supabase resource changes are part of this plan.

**Status:** IAM SAVED PLAN REVIEWED — APPROVED FOR APPLY.
