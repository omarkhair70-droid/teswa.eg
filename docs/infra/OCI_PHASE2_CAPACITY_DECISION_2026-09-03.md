# Teswa OCI Phase 2 Capacity Decision — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Status:** capacity measured; Phase 2 control-plane plan approved for planning only; no apply yet.

## Measured tenancy state

Read-only capacity checks in `me-jeddah-1` returned:

- A1 service availability: 14 cores available / 2 used.
- Existing Nova A1 usage remains 2 OCPU / 12 GB RAM.
- E2 Micro limits: 2 available / 0 used in `ME-JEDDAH-1-AD-1`.
- Always Free Block Storage pool: 200 GB total, 47 GB used, 153 GB available.
- Always Free volume backups: 5 available / 0 used.
- Teswa compartment: 0 compute, 0 boot volumes, 0 block volumes, 0 load balancers.
- Load Balancer service limits include `lb-10mbps-count=2` and legacy `lb-10mbps-micro-count=0`.
- Object Storage service limit is effectively unbounded and is not a billing entitlement.

## Billing interpretation

Service limits are not Always Free entitlements.

### A1

The tenancy-level A1 service limit is larger than the Always Free allowance. The Always Free A1 allowance is already fully consumed by the Nova-owned `nova-backend`.

**Decision:** Teswa gets no A1 Always Free compute. Nova remains hard no-touch.

### E2 Micro

Two E2 Micro slots are currently unused and available in the only AD.

They are auxiliary capacity only. Each has 1 GB RAM and is not approved as the sole PostgreSQL host or as a combined PostgreSQL/API/Realtime/Workers production node.

**Decision:** reserve them. Do not provision either in Phase 2.

### Block Storage

153 GB of the tenancy-wide Always Free Block Storage pool remains.

This pool is shared with existing tenancy resources; allocating E2 boot volumes would reduce the space available for a future Teswa data plane.

**Decision:** do not consume Block Storage in Phase 2. Preserve the 153 GB remainder until the PostgreSQL/compute topology is selected.

### Load Balancer

The `lb-10mbps-micro-count` limit is the legacy Micro-shape limit. Current Oracle Always Free documentation uses a flexible Load Balancer fixed at 10 Mbps for newer tenancies.

The presence of `lb-10mbps-count` must be checked independently before any LB plan/apply.

**Decision:** no Load Balancer in Phase 2. The read-only checker now queries both flexible and legacy 10 Mbps availability.

### Object Storage

Always Free Object Storage is a billing allowance separate from the huge service limit. The dedicated `teswa-terraform-state` bucket already exists and stores Terraform state plus bootstrap backups.

**Decision:** Phase 2 may plan two additional private buckets:
- `teswa-media`
- `teswa-backups` with Object Versioning enabled

No application data is migrated yet.

### Vault / Secrets

Use a DEFAULT/virtual Vault only; virtual private vaults are not part of Always Free. Real secret values remain outside Terraform.

**Decision:** Phase 2 may plan the existing `DEFAULT` `teswa-vault` container only. Secret/key creation comes in a later secrets wiring gate.

### Notifications

A Teswa-specific OCI Notifications topic is useful now and does not require runtime compute.

**Decision:** Phase 2 may plan `teswa-ops` topic. Subscriptions and alarms wait until concrete runtime resources exist.

## Phase 2 plan scope

The next Terraform plan may add exactly these control-plane resources:

1. `teswa-media` private Object Storage bucket.
2. `teswa-backups` private, versioned Object Storage bucket.
3. `teswa-vault` DEFAULT Vault.
4. `teswa-ops` Notifications topic.

It must not add:

- compute instances
- boot/block volumes
- load balancers
- public database ports
- PostgreSQL
- API/Realtime/Workers
- DNS
- Supabase cutover/migration
- any Nova/Balcona resource

## Gate

Run `plan-phase2-foundation-services.sh`.

Expected plan shape: **4 to add, 0 to change, 0 to destroy**.

Apply is forbidden until that saved plan is reviewed.
