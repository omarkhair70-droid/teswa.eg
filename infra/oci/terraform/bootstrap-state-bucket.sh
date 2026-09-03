#!/usr/bin/env bash
set -Eeuo pipefail

BUCKET_NAME="${TESWA_TF_STATE_BUCKET:-teswa-terraform-state}"

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform not found" >&2
  exit 1
fi

if ! command -v oci >/dev/null 2>&1; then
  echo "oci CLI not found" >&2
  exit 1
fi

if [ ! -f terraform.tfstate ]; then
  echo "terraform.tfstate not found in current directory" >&2
  exit 1
fi

COMPARTMENT="$(terraform output -raw teswa_compartment_id)"
NAMESPACE="$(oci os ns get --query data --raw-output)"

echo "TESWA TERRAFORM STATE BOOTSTRAP"

set +e
EXISTING_COMPARTMENT="$(oci os bucket get   --bucket-name "$BUCKET_NAME"   --namespace-name "$NAMESPACE"   --query 'data."compartment-id"'   --raw-output 2>/tmp/teswa-tf-state-bucket-get.err)"
GET_RC=$?
set -e

if [ "$GET_RC" -ne 0 ]; then
  if grep -qiE 'NotAuthorizedOrNotFound|404|not found' /tmp/teswa-tf-state-bucket-get.err; then
    echo "bucket action=create"
    oci os bucket create       --compartment-id "$COMPARTMENT"       --namespace-name "$NAMESPACE"       --name "$BUCKET_NAME"       --public-access-type NoPublicAccess       --storage-tier Standard       --versioning Enabled       --freeform-tags '{"product":"teswa","purpose":"terraform-state","managed_by":"bootstrap"}'       --query 'data.{name:name,versioning:versioning,public_access:"public-access-type",storage_tier:"storage-tier"}'
  else
    echo "Unable to inspect state bucket:" >&2
    cat /tmp/teswa-tf-state-bucket-get.err >&2
    exit "$GET_RC"
  fi
else
  if [ "$EXISTING_COMPARTMENT" != "$COMPARTMENT" ]; then
    echo "A bucket named $BUCKET_NAME exists outside the Teswa compartment. Aborting." >&2
    exit 2
  fi
  echo "bucket action=reuse"
fi

VERSIONING="$(oci os bucket get --bucket-name "$BUCKET_NAME" --namespace-name "$NAMESPACE" --query 'data.versioning' --raw-output)"
PUBLIC_ACCESS="$(oci os bucket get --bucket-name "$BUCKET_NAME" --namespace-name "$NAMESPACE" --query 'data."public-access-type"' --raw-output)"

if [ "$PUBLIC_ACCESS" != "NoPublicAccess" ]; then
  echo "State bucket is not private. Aborting." >&2
  exit 3
fi

if [ "$VERSIONING" != "Enabled" ]; then
  echo "Enabling Object Storage versioning on the Teswa state bucket."
  oci os bucket update     --bucket-name "$BUCKET_NAME"     --namespace-name "$NAMESPACE"     --versioning Enabled     --force >/dev/null
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OBJECT_NAME="bootstrap-backups/foundation-local-${STAMP}.tfstate"

oci os object put   --bucket-name "$BUCKET_NAME"   --namespace-name "$NAMESPACE"   --file terraform.tfstate   --name "$OBJECT_NAME"   --no-overwrite   --verify-checksum >/dev/null

echo "bucket_name=$BUCKET_NAME"
echo "bucket_private=true"
echo "bucket_versioning=Enabled"
echo "local_state_backup_uploaded=true"
echo "backup_object=$OBJECT_NAME"
echo
echo "Remote backend migration has NOT happened yet."
echo "No existing OCI resources were modified except creation/hardening of the Teswa state bucket."
