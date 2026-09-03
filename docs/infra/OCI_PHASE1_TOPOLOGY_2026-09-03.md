# Teswa OCI Phase 1 Topology — Isolated Foundation

**Date:** 2026-09-03  
**Branch:** `infra/oracle-platform-20260903`  
**Status:** Phase 1 foundation applied and verified; no cutover.

## Measured constraints

- Region: `me-jeddah-1`.
- Existing A1: `nova-backend`, 2 OCPU / 12 GB RAM — Nova-owned, hard no-touch.
- Always Free E2 Micro: 2 available, 0 used.
- Existing OCI network objects belong to the pre-existing tenancy state and must not be modified for Teswa.
- Object Storage buckets: 0.
- Load balancers: 0.
- Vaults: 0.
- Alarms/topics: 0.

## Architecture decision

Teswa gets a **separate infrastructure boundary**. No Teswa service will be attached to, colocated on, or routed through `nova-backend`.

### Network

Create a dedicated VCN:

- `teswa-vcn`
- public edge subnet
- private app subnet
- private data subnet
- dedicated NSGs
- separate route tables/security policy

Measured Nova network:

- VCN: `10.0.0.0/16`
- public subnet: `10.0.0.0/24`
- private subnet: `10.0.1.0/24`

Locked Teswa network:

- VCN: `10.20.0.0/16`
- public edge subnet: `10.20.0.0/24`
- private app subnet: `10.20.10.0/24`
- private data subnet: `10.20.20.0/24`

The ranges do not overlap. No existing Nova VCN, subnet, NSG, security list, or route table is modified.

### Compute

The two E2 Micro instances are **auxiliary only**.

Candidate use:

1. `teswa-edge-01` — tiny ingress/health/bastion role only if managed LB is not selected.
2. `teswa-ops-01` — monitoring/backup-control role, or leave unprovisioned as spare capacity.

Neither micro instance is approved as the sole PostgreSQL or combined Teswa application host.

The main Teswa application/data plane remains intentionally unallocated until a separate compute decision is approved.

### PostgreSQL

Target is PostgreSQL, not Autonomous Oracle Database.

Final production shape must provide:

- private network placement
- encrypted storage
- automated backups
- restore drills
- connection limits/tuning
- metrics/exporter
- no public port 5432 exposure

For the current foundation phase, schema/data migration from Supabase is forbidden.

### API / Realtime / Workers

Target services are independently deployable logical units:

- Teswa API
- Realtime gateway
- worker/scheduler

At small scale they may share one future application host, but deployment/config must preserve process isolation so they can split later.

### Object Storage

Create private Teswa-owned buckets later for:

- media staging/migration
- PostgreSQL backup exports
- operational artifacts

Client credentials never reach the mobile app. Upload/download authorization is issued through Teswa backend contracts.

### Secrets

Use OCI Vault/Secrets for future server-side secrets.

Never store:

- database passwords
- signing keys
- OCI credentials
- service-role keys

in Git, Expo public env vars, or committed Terraform variable files.

### TLS / ingress

Two valid lanes:

- managed OCI Load Balancer with TLS termination; or
- minimal edge VM with Caddy/another audited reverse proxy.

Selection depends on final cost/availability check. Only ports 80/443 are public.

### Backups

Before cutover, require:

- PostgreSQL logical backup schedule
- volume/snapshot policy
- Object Storage retention
- restore test
- documented RPO/RTO

Backups that have never been restored do not count as a closed production backup lane.

### Monitoring

Create Teswa-specific:

- OCI alarms
- notification topic/subscription
- VM CPU/memory/disk monitoring
- PostgreSQL health/storage/connection monitoring
- API latency/error metrics
- Realtime connection/reconnect metrics
- worker failure/queue-depth metrics
- backup-failure alarm
- TLS-expiry alert

## Cost boundary

Current official Oracle documentation still lists two Always Free `VM.Standard.E2.1.Micro` instances, each with 1 GB memory, in the home region. Oracle also documents Always Free allowances for Object Storage, Vault/Secrets, monitoring/notifications, and the first 10 Mbps of Load Balancer bandwidth.

Service limits are not billing entitlements. Every Terraform resource must be reviewed for billing impact before apply.

## Phase 1 implementation order

1. Represent isolated Teswa compartment/network as Terraform using the locked 10.20.0.0/16 address space.
2. Represent private Object Storage buckets.
3. Represent Vault/Secrets containers without real secret values.
4. Represent monitoring topic/alarms.
5. Add optional E2 Micro modules, default disabled.
6. Add optional LB module, default disabled.
7. Run `terraform fmt/validate/plan`.
8. Review plan for any reference to existing Nova resource IDs.
9. Apply only after explicit approval.
10. Keep Supabase production untouched until a later migration/cutover lane.

## Non-goals

- no Supabase shutdown
- no DNS switch
- no mobile endpoint switch
- no Nova change
- no Balcona change
- no PostgreSQL data migration
- no production traffic
