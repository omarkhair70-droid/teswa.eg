# Teswa OCI Terraform Foundation

This stack represents Teswa-only OCI resources.

## Hard rules

- Never import or reference `nova-backend`.
- Never modify Nova or Balcona VCNs/subnets/security lists/volumes.
- No production cutover in this lane.
- Do not commit `terraform.tfvars`, state files, plan files, OCIDs copied from state, or secrets.
- Optional billable/free-tier-sensitive services are disabled by default.

## Current measured compute state

- A1 Always Free allocation is occupied by `nova-backend` (2 OCPU / 12 GB).
- Two E2 Micro slots are currently available and unused.
- E2 Micro is auxiliary capacity only; it is not the company-grade PostgreSQL + API + Realtime + Workers host.

## Before planning

1. Create/select a dedicated Teswa compartment.
2. Check the existing Nova VCN CIDR read-only.
3. Pick a non-overlapping Teswa VCN CIDR plus three child subnet CIDRs.
4. Copy `terraform.tfvars.example` to a local `terraform.tfvars`.
5. Keep all optional services disabled for the first network-only plan.

## Validation

```bash
cd infra/oci/terraform
terraform init
terraform fmt -check
terraform validate
terraform plan -out=teswa-foundation.plan
```

Review the plan carefully.

The plan must contain only newly created `teswa-*` resources. Any reference to `nova-backend` or an existing Nova-owned network resource is a blocker.

Do **not** run `terraform apply` until the plan is explicitly approved.
