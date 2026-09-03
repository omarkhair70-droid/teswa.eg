# Teswa Terraform Durable State Gate — 2026-09-03

## Why this gate exists

OCI Foundation Phase 1 is now applied and verified, but its Terraform state is still local to OCI Cloud Shell.

That is not acceptable before expanding the platform because Terraform state is the authoritative mapping between configuration and real OCI resources.

## Target

Use OCI Object Storage for durable remote Terraform state.

The dedicated bootstrap bucket is:

- `teswa-terraform-state`
- private
- Standard storage tier
- Object Versioning enabled
- located in the Teswa compartment
- bootstrap-managed so the backend never depends on a bucket stored inside the same state it needs to read

The first step only creates/hardens the bucket and uploads a point-in-time backup of the current local state. It does **not** migrate Terraform's backend yet.

## Why migration is split into two steps

OCI Cloud Shell currently ships Terraform 1.5.7.

Oracle documents an S3-compatible Object Storage backend path for Terraform versions below 1.6.4, but current Terraform has a native `oci` backend with OCI Object Storage state locking.

For the company foundation, prefer the native OCI backend after moving Cloud Shell to a current official Terraform release. This avoids introducing long-lived S3 compatibility credentials just to preserve state.

## Step 1 — durable backup bucket

From `infra/oci/terraform`:

```bash
git pull
bash bootstrap-state-bucket.sh
```

Expected result:

```text
bucket_name=teswa-terraform-state
bucket_private=true
bucket_versioning=Enabled
local_state_backup_uploaded=true
...
Remote backend migration has NOT happened yet.
```

## Step 2 — later backend migration

After the bucket is verified:

1. install/verify a current official HashiCorp Terraform release for Linux ARM64;
2. configure the native `oci` backend with the existing Cloud Shell OCI security-token/profile context;
3. run `terraform init -migrate-state`;
4. confirm migration explicitly;
5. run `terraform plan -detailed-exitcode` and require zero drift;
6. verify the remote state object and state lock behavior;
7. only then remove reliance on the local state file.

Do not delete the local state or its uploaded bootstrap backup during migration.

## Hard boundaries

- no Nova changes
- no Balcona changes
- no Teswa compute yet
- no PostgreSQL yet
- no API/Realtime/Workers yet
- no DNS/cutover
- no Supabase migration
