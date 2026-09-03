# Teswa OCI Phase 1 Terraform Plan Review — 2026-09-03

## Result

**GREEN FOR FOUNDATION APPLY ONLY**

The first authenticated OCI Terraform plan was generated successfully in Cloud Shell after:

- `terraform init`
- `terraform fmt`
- `terraform validate`
- `terraform plan`

Terraform reported:

- 17 to add
- 0 to change
- 0 to destroy

## Planned resources

The plan contains only the approved Teswa foundation boundary:

- dedicated `teswa-platform` compartment
- `teswa-vcn` at `10.20.0.0/16`
- public edge subnet `10.20.0.0/24`
- private app subnet `10.20.10.0/24`
- private data subnet `10.20.20.0/24`
- internet gateway
- public route table
- three Teswa NSGs
- explicit HTTP/HTTPS edge ingress rules
- edge-to-app rule
- app-to-PostgreSQL rule
- PostgreSQL-from-app rule
- intentionally empty security list

## Safety checks

Confirmed from the plan:

- no update operations
- no destroy operations
- no compute instances
- no A1 or E2 Micro creation
- no PostgreSQL deployment
- no Object Storage bucket creation
- no Vault creation
- no notification topic creation
- no load balancer creation
- no Nova VCN/subnet resource references
- no `nova-backend` modification
- no Balcona resources
- no Supabase changes
- no DNS or production traffic cutover

## Security review

- public ingress is limited to TCP/80 and TCP/443 on the edge NSG
- there is no public SSH rule
- PostgreSQL TCP/5432 is modeled only between the app NSG and data NSG
- private app/data subnets prohibit public IP assignment
- Teswa uses a separate non-overlapping VCN from Nova
- subnets use an intentionally empty security list rather than inherited permissive defaults

## Known intentional incompleteness

This foundation is not yet an application platform.

The following remain intentionally absent:

- NAT/service gateway for private application egress
- API host
- Realtime host/process
- worker/scheduler host/process
- PostgreSQL host
- TLS certificate/domain binding
- Object Storage
- Vault secrets
- backup jobs
- monitoring alarms/topics
- E2 Micro auxiliary nodes
- load balancer
- Supabase migration

These are later gates and must not be inferred from a successful foundation apply.

## Decision

The saved plan `teswa-foundation.plan` is approved from a topology/safety perspective for **foundation-only apply**.

Before apply:

1. ensure the plan file is the same plan just reviewed;
2. do not regenerate it with changed variables;
3. apply only with `terraform apply "teswa-foundation.plan"`;
4. after apply, immediately run `terraform output` and a read-only OCI inventory check to prove only Teswa resources were created;
5. do not proceed to compute, database, storage, DNS, or production cutover automatically.
