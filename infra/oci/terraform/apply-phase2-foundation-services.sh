#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE2_PLAN:-teswa-phase2-foundation-services.plan}"

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
  exit 1
fi

if [ ! -f "$PLAN" ]; then
  echo "Saved plan not found: $PLAN" >&2
  exit 2
fi

echo "TESWA OCI PHASE 2 SAVED PLAN APPLY"
echo "terraform=$($TF version | head -n1)"
echo "plan=$PLAN"
echo

"$TF" apply "$PLAN"
