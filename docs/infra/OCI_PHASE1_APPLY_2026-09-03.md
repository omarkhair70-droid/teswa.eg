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

## Hard boundary still in force

This apply did **not** create or change:

- Nova compute
- `nova-backend`
- Nova VCN/subnets
- Balcona resources
- Teswa compute
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

**APPLIED — POST-APPLY VERIFICATION PENDING**

Do not start the next platform layer until:

1. OCI resources are read back and confirmed AVAILABLE;
2. Teswa compartment contains zero compute instances;
3. Terraform reports no post-apply drift;
4. state durability/remote-backend handling is closed before further infrastructure expansion.
