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
- a dedicated OCI API-key profile for the Terraform backend

The backend bucket remains outside the Terraform state it stores; it is bootstrap-managed intentionally.

## Authentication decision

OCI Cloud Shell's pre-authenticated CLI uses `instance_obo_user` delegation credentials under `/etc/oci`.

Two SecurityToken attempts were rejected by the environment:
- browser authentication redirected to `localhost:8181` on the user's desktop rather than the remote Cloud Shell;
- `--no-browser --auth instance_obo_user` returned `NotAuthorizedOrNotFound` while trying to generate a user security token.

The native OCI backend does not document `instance_obo_user` as an authentication mode. It does document `APIKey`, `InstancePrincipal`, `ResourcePrincipal`, `SecurityToken`, and related modes.

Cloud Shell itself runs in an Oracle-managed tenancy, so treating the Cloud Shell VM as an Instance Principal for the user's tenancy is not the right boundary.

Decision: create a dedicated RSA API signing key for the current OCI user and store the private half only in the user's encrypted Cloud Shell home directory (`~/.oci`). OCI receives only the public key. The profile is named `teswa-terraform`.

OCI permits at most three API signing keys per user, so the setup helper checks the current count before uploading anything.

## Migration sequence

1. Install an official current Terraform binary (>= 1.12) in the user's home directory and verify its SHA256 checksum.
2. Run `bash setup-terraform-api-key.sh` to create/test the dedicated `teswa-terraform` API-key profile.
3. Run `terraform init -migrate-state` against the native OCI backend using that API-key profile.
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
