# Teswa OCI Phase 3 Compute Plan Review — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Saved plan:** `teswa-phase3-compute.plan`  
**Status:** APPROVED FOR APPLY

## Validation

Terraform configuration validation passed before plan generation.

The guard returned:

- `adds=6`
- `updates=1`
- `destroys=0`
- `phase3_plan_guard=PASS`

## Reviewed compute

### teswa-core-01

- shape: `VM.Standard.A1.Flex`
- 1 OCPU
- 6 GB RAM
- 50 GB boot volume
- private app subnet
- public IP disabled
- app NSG
- Oracle Linux 9 AArch64 pinned locally

### teswa-edge-01

- shape: `VM.Standard.E2.1.Micro`
- 50 GB boot volume
- public edge subnet
- public IP enabled
- edge NSG
- Oracle Linux 9 x86_64 pinned locally

## Reviewed networking

Creates:

- one NAT gateway: `teswa-app-nat`
- one private-app route table
- one edge outbound rule
- one app outbound rule

The only update is the existing `teswa-private-app` subnet changing its route-table association to the new private route table.

There are no deletes.

## Storage boundary

Before apply, measured tenancy-wide Always Free Block Storage was:

- 47 GB used
- 153 GB available

The plan creates two 50 GB boot volumes.

Expected post-apply allocation:

- approximately 147 GB used
- approximately 53 GB available

No data volume is created yet.

## Security boundary

- no SSH ingress
- core has no public IP
- edge public ingress remains TCP 80/443 only
- PostgreSQL is not public
- no credentials or secret values are in Terraform
- no production traffic or DNS cutover occurs

## Billing boundary

The plan stays within the already measured A1, E2 Micro, and free Block Storage capacity.

Current OCI public pricing lists the first 10 TB/month of outbound data transfer from Middle East and Africa as free. A separate NAT Gateway SKU is not listed in the current Networking price section; billing/account policy must still be monitored after creation.

No paid compute or managed database is approved.

## Apply requirement

Use the exact reviewed saved plan and Terraform 1.16.0:

```bash
bash apply-phase3-compute.sh
```

Do not run a fresh unsaved apply.

## Closure gate

Phase 3 closes only after:

- edge/core instances are RUNNING
- core is 1 OCPU / 6 GB
- A1 usage becomes 2 OCPU total
- E2 Micro usage becomes 1
- Block Storage usage reflects the two new boot volumes
- NAT gateway is AVAILABLE
- `terraform_drift=none`
