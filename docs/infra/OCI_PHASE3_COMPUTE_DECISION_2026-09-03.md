# Teswa OCI Phase 3 Compute Decision — 2026-09-03

**Branch:** `infra/oracle-platform-20260903`  
**Status:** SAVED PLAN REVIEWED — APPROVED FOR APPLY.

## Released capacity

Nova is now verified at 1 OCPU / 6 GB RAM.

Teswa may consume the released Always Free A1 allocation:

- A1: 1 OCPU / 6 GB RAM
- E2 Micro: one of the two currently-unused instances
- Block Storage before Phase 3: 153 GB free in the tenancy-wide 200 GB Always Free pool

Phase 3 fixes both new boot volumes at 50 GB. If applied, the measured pool would move from 153 GB free to approximately 53 GB free.

## Topology

### teswa-edge-01

- `VM.Standard.E2.1.Micro`
- public edge subnet
- public IP
- edge NSG only
- public ingress remains limited to TCP 80/443
- future role: Caddy/TLS/reverse proxy and health edge
- no PostgreSQL
- no application secrets in Terraform

### teswa-core-01

- `VM.Standard.A1.Flex`
- exactly 1 OCPU / 6 GB RAM
- private app subnet
- no public IP
- app NSG only
- future role: PostgreSQL + Teswa API + Realtime + Workers as isolated processes on the same early-stage host
- PostgreSQL must bind locally/private only; port 5432 is never public

### Private outbound

A managed OCI NAT gateway gives `teswa-core-01` outbound-only internet access for OS updates, container/package pulls, push/email APIs, and other required external services without assigning the core node a public IP.

The private app subnet receives a dedicated route table whose default route points to that NAT gateway.

## Operations

No public SSH rule is introduced.

Oracle Cloud Agent management and monitoring remain enabled on both instances so the later bootstrap lane can use OCI Run Command and monitoring instead of exposing SSH.

## Image policy

Oracle Linux image OCIDs are pinned locally before planning.

They are deliberately not committed into Git and are not selected dynamically inside Terraform, preventing a future platform-image refresh from silently proposing instance replacement.

## Phase 3 plan boundary

Expected Terraform resource actions:

- 6 creates:
  - `oci_core_nat_gateway.app_egress[0]`
  - `oci_core_route_table.private_app[0]`
  - `oci_core_network_security_group_security_rule.edge_egress[0]`
  - `oci_core_network_security_group_security_rule.app_egress[0]`
  - `oci_core_instance.edge[0]`
  - `oci_core_instance.core[0]`
- 1 update:
  - `oci_core_subnet.private_app` route table association
- 0 destroys

No existing Nova resource is referenced by Terraform.

## Still forbidden

- no Supabase shutdown
- no production cutover
- no DNS switch
- no data migration
- no secrets in Terraform
- no PostgreSQL public ingress
- no additional Nova resize


## Preflight result

Read-only Phase 3 compute preflight passed:

- availability domain resolved successfully
- Nova A1 usage confirmed at 1 OCPU
- 2 E2 Micro slots available / 0 used
- 153 GB Always Free Block Storage available / 47 GB used
- no existing Teswa NAT gateway
- Oracle Linux 9 images resolved for both A1 and E2
- local pinned image variable file created with permissions `600`
- `preflight=PASS`

The OCI CLI emitted pagination warnings while listing images because the command requested a single newest item. This did not invalidate the result; the image list was sorted newest-first and the first compatible image was pinned locally.


## Saved plan review result

The saved Terraform plan was reviewed after a successful validation and guarded plan.

Reviewed result:

- 6 creates
- 1 in-place update
- 0 destroys
- `phase3_plan_guard=PASS`

Approved creates:

- `oci_core_instance.core[0]` — A1 Flex, 1 OCPU / 6 GB, private app subnet, no public IP, 50 GB boot
- `oci_core_instance.edge[0]` — E2.1.Micro, public edge subnet, public IP, 50 GB boot
- `oci_core_nat_gateway.app_egress[0]`
- `oci_core_route_table.private_app[0]`
- edge outbound NSG rule
- app outbound NSG rule

Approved update:

- `oci_core_subnet.private_app` route-table association only

No Nova resource, no existing boot volume, no database, no DNS, and no Supabase resource is changed or destroyed.

Phase 3 must be applied from the reviewed saved plan with the same Terraform 1.16.0 binary that created it.
