# Teswa OCI Phase 1 Foundation Apply — 2026-09-03

## Apply result

The reviewed saved Terraform plan was applied successfully in OCI Cloud Shell.

Terraform reported:

- 17 resources added
- 0 resources changed
- 0 resources destroyed

The applied foundation contains only the previously reviewed Teswa boundary:

- `teswa-platform` compartment
- `teswa-vcn` at `10.20.0.0/16`
- public edge subnet at `10.20.0.0/24`
- private app subnet at `10.20.10.0/24`
- private data subnet at `10.20.20.0/24`
- internet gateway
- public route table
- three NSGs
- explicit NSG rules
- intentionally empty security list

## Post-apply verification observed

Confirmed:

- compartment `teswa-platform` is `ACTIVE`;
- VCN `teswa-vcn` is `AVAILABLE` at `10.20.0.0/16`;
- public edge subnet is `AVAILABLE` at `10.20.0.0/24`;
- private app subnet is `AVAILABLE` at `10.20.10.0/24` with public IP assignment prohibited;
- private data subnet is `AVAILABLE` at `10.20.20.0/24` with public IP assignment prohibited;
- NSG count is 3;
- Terraform reports no drift.

The first verifier printed a blank compute count because of its JMESPath filter expression. That verifier was corrected to use a direct `length(data)` query and to fail closed if the count is blank.

## Hard boundary still in force

This apply did **not** create or change:

- Nova compute
- `nova-backend`
- Nova VCN/subnets
- Balcona resources
- Teswa compute in the Terraform plan
- PostgreSQL
- API/Realtime/Workers
- Object Storage
- Vault
- notification topics
- load balancer
- DNS
- Supabase
- production traffic

## Status

**CLOSED — FOUNDATION VERIFIED**

Final corrected verification returned:

- `compute_instances=0`
- `terraform_drift=none`

OCI Foundation Phase 1 is therefore closed.

The next infrastructure gate is durable remote Terraform state before adding compute, PostgreSQL, API, Realtime, Workers, Object Storage application buckets, Vault secrets, monitoring, DNS, or production traffic.
