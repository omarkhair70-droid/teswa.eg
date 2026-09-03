#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PROFILE="${TESWA_TF_PROFILE:-teswa-terraform}"
BUCKET="${TESWA_TF_STATE_BUCKET:-teswa-terraform-state}"
KEY="${TESWA_TF_STATE_KEY:-foundation/terraform.tfstate}"
REGION="${TESWA_TF_REGION:-me-jeddah-1}"

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
  echo "Run: bash install-terraform-native.sh" >&2
  exit 1
fi

if ! "$TF" version >/dev/null 2>&1; then
  echo "Terraform binary is not runnable: $TF" >&2
  exit 1
fi

if [ ! -f "$HOME/.oci/config" ]; then
  echo "No ~/.oci/config found for SecurityToken profile." >&2
  echo "Create it first with:" >&2
  echo "  oci session authenticate --region $REGION --profile-name $PROFILE" >&2
  exit 2
fi

if ! grep -qE "^\[$PROFILE\]$" "$HOME/.oci/config"; then
  echo "OCI profile [$PROFILE] not found in ~/.oci/config." >&2
  echo "Create it first with:" >&2
  echo "  oci session authenticate --region $REGION --profile-name $PROFILE" >&2
  exit 2
fi

NAMESPACE="$(oci os ns get --query data --raw-output)"

echo "TESWA TERRAFORM REMOTE STATE MIGRATION"
echo "terraform=$($TF version | head -n1)"
echo "backend=oci"
echo "bucket=$BUCKET"
echo "key=$KEY"
echo "region=$REGION"
echo "profile=$PROFILE"
echo
echo "Terraform will ask whether to copy the existing local state."
echo "Approve only the state copy; this command does not apply infrastructure."
echo

"$TF" init -migrate-state   -backend-config="bucket=$BUCKET"   -backend-config="namespace=$NAMESPACE"   -backend-config="key=$KEY"   -backend-config="region=$REGION"   -backend-config="auth=SecurityToken"   -backend-config="config_file_profile=$PROFILE"

echo
echo "Migration init completed."
echo "Next: run bash verify-remote-state.sh"
