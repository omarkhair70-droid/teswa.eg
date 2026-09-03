# Teswa Terraform Durable State Gate — 2026-09-03

## Current status

OCI Foundation Phase 1 is closed and verified.

The dedicated Terraform state bucket bootstrap also completed successfully:

- bucket: `teswa-terraform-state`
- public access: `NoPublicAccess`
- storage tier: `Standard`
- Object Versioning: `Enabled`
- a point-in-time backup of the current local `terraform.tfstate` was uploaded under `bootstrap-backups/`

The Terraform backend itself is **still local**. Migration has not happened yet.

## Why the next step requires a newer Terraform binary

OCI Cloud Shell currently provides Terraform 1.5.7.

Oracle's current guidance recommends the native OCI backend and says to use Terraform **v1.12.0 or greater** for it. The older S3-compatible Object Storage backend path is deprecated.

Therefore this lane will not introduce S3 compatibility credentials.

## Native OCI backend target

The remote backend will use:

- backend type: `oci`
- bucket: `teswa-terraform-state`
- key: `foundation/terraform.tfstate`
- region: `me-jeddah-1`
- Object Storage namespace discovered at runtime
- state locking provided by the native OCI backend
- a temporary OCI SecurityToken profile for interactive Cloud Shell migration

The backend bucket remains outside the Terraform state it stores; it is bootstrap-managed intentionally.

## Authentication note

OCI Cloud Shell's pre-authenticated CLI uses its own delegation-token context under `/etc/oci`.

The native Terraform OCI backend documents `SecurityToken` authentication, not Cloud Shell's `instance_obo_user` delegation mode. For the migration step, create a separate short-lived CLI session profile named `teswa-terraform`.

Security tokens expire, so this is an interactive migration/authentication lane, not the final CI identity design.

## Migration sequence

1. Install an official current Terraform binary (>= 1.12) in the user's home directory and verify its SHA256 checksum.
2. Create/refresh the `teswa-terraform` OCI SecurityToken profile.
3. Run `terraform init -migrate-state` against the native OCI backend.
4. Confirm copying the existing local state to the remote backend.
5. Run a zero-drift plan.
6. Verify the remote state object exists.
7. Keep the bootstrap backup and any local migration backup until the remote backend is proven stable.

## Hard boundaries

- no Nova changes
- no Balcona changes
- no Teswa compute yet
- no PostgreSQL yet
- no API/Realtime/Workers yet
- no DNS/cutover
- no Supabase migration
