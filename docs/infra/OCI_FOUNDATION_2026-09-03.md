# Teswa OCI Foundation — Phase 0 / Inventory Gate

**Date:** 2026-09-03  
**Branch:** `infra/oracle-platform-20260903`  
**Scope:** Teswa only. Do not touch Nova or Balcona.  
**Cutover:** Forbidden in this phase.

## Goal

Build an OCI foundation for Teswa as a company-owned platform, but only after measuring the tenancy's real limits, usage, and currently provisioned resources.

The intended platform domains are:

- PostgreSQL
- Teswa API
- Realtime gateway
- Background workers / scheduled jobs
- OCI Object Storage
- TLS / ingress
- Network firewall policy
- Secrets
- Backups
- Monitoring / alerting

No production traffic, DNS, Supabase migration, data migration, or mobile endpoint switch is allowed in Phase 0.

## Current product reality

Teswa is currently a Supabase-native mobile product.

Repository evidence:

- Mobile config exposes `EXPO_PUBLIC_SUPABASE_URL` and a publishable key.
- The app creates a Supabase client directly.
- Direct Chat persistence, attachments, reactions, typing and realtime are Supabase-native.
- Media uses Supabase Storage signed URLs/uploads.
- Production-owned backend actions currently live as Supabase Edge Functions such as account deletion, push delivery, and smart re-engagement jobs.

Therefore OCI is a **target platform lane**, not an assumption that an existing NestJS/Redis backend already exists.

## Oracle public Always Free baseline (reference only)

As of 2026-09-03, Oracle's current documentation states a baseline that includes:

- Ampere A1 Compute: up to **2 OCPUs total** and **12 GB memory total** across eligible A1 instances.
- Block Volume: **200 GB total** across boot + block volumes, with up to five Always Free volume backups.
- Object Storage: **20 GB** combined Always Free capacity.
- Load Balancer: the first **10 Mbps** of bandwidth is free in the home region.
- Vault: Always Free secret/key allowances are available.
- Autonomous Database exists as an Always Free Oracle Database offering, but it is **not PostgreSQL** and is therefore not the target datastore for this lane.

These are public offer limits, not proof of what this tenancy can still allocate.

Official references:

- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://docs.oracle.com/en-us/iaas/Content/General/service-limits/view-tenancy.htm

## Inventory gate

Run `infra/oci/inventory/collect.sh` in OCI Cloud Shell or any machine with an authenticated OCI CLI profile.

The collector is read-only. It records:

1. CLI/account context without private keys.
2. Home/available regions.
3. Availability domains.
4. Active compartments.
5. Supported limit services.
6. Limit values for all supported services.
7. Explicit quotas.
8. Current compute instances.
9. Boot/block volumes.
10. Object Storage buckets.
11. Load balancers.
12. VCNs/subnets/NSGs/security lists.
13. Vaults/secrets metadata.
14. Alarms and notification topics where accessible.

The output contains OCIDs and infrastructure metadata. It must remain local and must never be committed.

## Decision gate

Do not lock a deployment topology until the inventory shows:

- A1 OCPU limit / used / available
- A1 memory limit / used / available
- free block storage remaining
- current instance/volume footprint
- Object Storage capacity/use
- load balancer availability
- home region
- VCN/network objects already consuming quota
- secrets/vault availability

## Candidate topology after inventory

This is deliberately provisional.

### Free-foundation shape

If the tenancy really has the full current A1 allowance available, the preferred first non-production shape is:

```
Internet
   |
OCI Load Balancer or Caddy edge (decision after quota check)
   |
VCN
   |
Teswa Platform Compute
   |-- TLS/ingress
   |-- API
   |-- Realtime
   |-- Worker/Scheduler
   |-- PostgreSQL
   |-- local metrics exporters
   |
   +--> OCI Object Storage
   +--> OCI Vault / secrets
   +--> OCI Monitoring / alarms
   +--> Object/volume backup path
```

Why one compute node is the default candidate: the current Always Free A1 pool is only 2 OCPUs / 12 GB total. Splitting into two 1-OCPU nodes gives cleaner isolation but can starve both PostgreSQL and application runtime. We will choose single-node vs split-node only after the real tenancy inventory.

This free shape is a **foundation/dev/staging lane**, not a claim of HA production architecture.

### Company-scale target

The design must preserve an upgrade path to:

- public ingress / load balancer
- private application subnet
- private PostgreSQL subnet
- independently scalable API/realtime workers
- managed secret rotation
- separate backup retention
- observability independent of application process
- controlled Supabase-to-OCI migration with rollback

No implementation in Phase 0 may make that future split harder.

## Data-plane principles

### PostgreSQL

- PostgreSQL remains the target relational datastore.
- No Oracle Autonomous Database substitution.
- DB is never exposed directly to the public internet.
- TLS is required for remote DB access.
- Backups must be test-restorable, not just created.

### API

- Mobile clients must ultimately talk to a stable Teswa API contract for company-owned backend actions.
- No OCI credentials may be shipped to the mobile app.
- Existing Supabase contracts remain untouched until migration work is explicitly scheduled.

### Realtime

- Realtime must be independently restartable from the API process.
- The first low-resource implementation may use PostgreSQL-backed coordination to avoid introducing Redis before it is justified.
- External clients use authenticated WebSocket/SSE contracts, never direct database connectivity.

### Workers

- Background jobs must be idempotent and retry-safe.
- Prefer a PostgreSQL-backed queue/scheduler at the Always Free stage to avoid an extra stateful dependency.
- A later scale lane may move queue/pub-sub responsibilities to a dedicated service.

### Object Storage

- Client uploads are brokered by the API through short-lived upload/download authorization.
- Buckets are private by default.
- Public media delivery, CDN, retention, and lifecycle rules are separate later decisions.
- Existing Supabase Storage is not modified in this phase.

## Network / security boundaries

Minimum target:

- deny-by-default ingress
- public ports limited to 80/443 at the edge
- SSH restricted to an explicit administration path
- PostgreSQL never open to `0.0.0.0/0`
- application-to-database connectivity only inside the VCN/host boundary
- OCI credentials use least privilege
- secrets never committed to Git
- OCI inventory outputs are gitignored

## Backup target

Before any future cutover:

- automated PostgreSQL logical backup
- periodic physical/snapshot strategy where appropriate
- Object Storage copy/retention policy
- OCI volume backup policy
- restore drill with measured recovery steps
- documented RPO/RTO assumptions

## Monitoring target

Before any future cutover:

- VM CPU/RAM/disk
- PostgreSQL connection count/locks/slow queries/storage
- API latency/error rate
- WebSocket connection count/reconnect failures
- worker queue depth/job failures
- backup success/failure
- TLS expiry
- disk-growth alarm
- external health endpoint

## Phase 0 exit criteria

Phase 0 is complete only when:

- the inventory output has been reviewed;
- real quota/usage numbers are known;
- no production system was changed;
- no Nova/Balcona resource was touched;
- a topology is chosen from measured constraints;
- the next infrastructure change can be represented as code and reviewed before apply.
