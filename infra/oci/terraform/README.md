# Teswa OCI Terraform Foundation

This stack represents Teswa-only OCI resources.

## Hard rules

- Never import or reference `nova-backend`.
- Never modify Nova or Balcona VCNs/subnets/security lists/volumes.
- No production cutover in this lane.
- Do not commit `terraform.tfvars`, state files, plan files, OCIDs copied from state, or secrets.
- Optional billable/free-tier-sensitive services are disabled by default.

## Current measured state

- Region: `me-jeddah-1`.
- Nova VCN: `10.0.0.0/16`.
- Nova public subnet: `10.0.0.0/24`.
- Nova private subnet: `10.0.1.0/24`.
- A1 Always Free allocation is occupied by `nova-backend` (2 OCPU / 12 GB).
- Two E2 Micro slots are currently available and unused.
- E2 Micro is auxiliary capacity only; it is not the company-grade PostgreSQL + API + Realtime + Workers host.

## Teswa network decision

Teswa is locked to a separate, non-overlapping address space:

- VCN: `10.20.0.0/16`
- public edge: `10.20.0.0/24`
- private app: `10.20.10.0/24`
- private data/PostgreSQL: `10.20.20.0/24`

The stack creates a dedicated `teswa-platform` compartment and does not reference the existing Nova VCN.

Subnets use an intentionally empty security list plus explicit NSGs. There is no public SSH rule. PostgreSQL ingress is only modeled from the app NSG on TCP/5432.

## First plan in OCI Cloud Shell

From the repo root:

```bash
git pull
cd infra/oci/terraform

TENANCY=$(python3 - <<'PY'
import json
p="../inventory/out/20260903T095900Z/tenancy.json"
print(json.load(open(p))["data"]["id"])
PY
)

cat > terraform.tfvars <<EOF
region       = "me-jeddah-1"
tenancy_ocid = "$TENANCY"

vcn_cidr           = "10.20.0.0/16"
public_subnet_cidr = "10.20.0.0/24"
app_subnet_cidr    = "10.20.10.0/24"
data_subnet_cidr   = "10.20.20.0/24"

enable_object_storage = false
enable_vault           = false
enable_notifications   = false
EOF

terraform init
terraform fmt -check
terraform validate
terraform plan -out=teswa-foundation.plan
```

If `terraform` is not available in Cloud Shell, stop after the version/error output; do not install random binaries.

## Review gate

The first plan is intentionally network/compartment-only.

It may create:

- `teswa-platform` compartment
- `teswa-vcn`
- one public edge subnet
- two private subnets
- an internet gateway for the public edge
- dedicated NSGs
- an empty security list
- required routing/security rules

It must **not** contain:

- any update/destroy operation
- `nova-backend`
- Nova VCN/subnet references
- compute instances
- PostgreSQL
- Object Storage buckets
- Vault
- notification topics
- load balancers

Do **not** run `terraform apply` until the plan is explicitly reviewed and approved.
