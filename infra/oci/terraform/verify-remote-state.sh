#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
BUCKET="${TESWA_TF_STATE_BUCKET:-teswa-terraform-state}"
KEY="${TESWA_TF_STATE_KEY:-foundation/terraform.tfstate}"

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
  exit 1
fi

NAMESPACE="$(oci os ns get --query data --raw-output)"

echo "TESWA TERRAFORM REMOTE STATE VERIFY"

set +e
OBJ_NAME="$(oci os object head   --bucket-name "$BUCKET"   --namespace-name "$NAMESPACE"   --name "$KEY"   --query 'headers."content-length"'   --raw-output 2>/tmp/teswa-state-head.err)"
HEAD_RC=$?
set -e

if [ "$HEAD_RC" -ne 0 ]; then
  echo "remote_state_object=missing"
  cat /tmp/teswa-state-head.err >&2
  exit 2
fi

echo "remote_state_object=present"
echo "remote_state_size_bytes=$OBJ_NAME"

echo
echo "Terraform drift check:"
set +e
"$TF" plan -detailed-exitcode -no-color >/tmp/teswa-remote-state-plan.txt
PLAN_RC=$?
set -e

case "$PLAN_RC" in
  0)
    echo "terraform_drift=none"
    ;;
  2)
    echo "terraform_drift=changes_detected"
    tail -n 100 /tmp/teswa-remote-state-plan.txt
    exit 3
    ;;
  *)
    echo "terraform_plan=error"
    tail -n 100 /tmp/teswa-remote-state-plan.txt
    exit "$PLAN_RC"
    ;;
esac

echo
echo "Remote state gate is green."
