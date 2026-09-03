#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE4_IAM_PLAN:-teswa-phase4-run-command-iam.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
[ -f "$PLAN" ] || { echo "Saved IAM plan not found: $PLAN" >&2; exit 2; }

VERSION="$("$TF" version | head -n1)"
if [ "$VERSION" != "Terraform v1.16.0" ]; then
  echo "Refusing apply: reviewed plan was created with Terraform v1.16.0; found: $VERSION" >&2
  exit 3
fi

echo "TESWA PHASE 4 RUN COMMAND IAM APPLY"
echo "terraform=$VERSION"
echo "plan=$PLAN"
echo

"$TF" apply "$PLAN"
