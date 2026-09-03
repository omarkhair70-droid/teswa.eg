#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE3_PLAN:-teswa-phase3-compute.plan}"

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
  exit 1
fi

if [ ! -f "$PLAN" ]; then
  echo "Saved plan not found: $PLAN" >&2
  exit 2
fi

VERSION="$("$TF" version | head -n1)"
if [ "$VERSION" != "Terraform v1.16.0" ]; then
  echo "Refusing apply: saved plan was reviewed with Terraform v1.16.0, found: $VERSION" >&2
  exit 3
fi

echo "TESWA OCI PHASE 3 SAVED PLAN APPLY"
echo "terraform=$VERSION"
echo "plan=$PLAN"
echo

"$TF" apply "$PLAN"
