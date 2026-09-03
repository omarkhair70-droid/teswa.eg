#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE4_BASTION_INGRESS_PLAN:-teswa-phase4-bastion-canonical-ingress.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
[ -f "$PLAN" ] || { echo "Missing reviewed saved plan: $PLAN" >&2; exit 2; }

VERSION="$("$TF" version | head -n1)"
[ "$VERSION" = "Terraform v1.16.0" ] || {
  echo "Refusing apply: reviewed plan requires Terraform v1.16.0; found $VERSION" >&2
  exit 3
}

echo "TESWA PHASE 4 CANONICAL BASTION INGRESS APPLY"
echo "terraform=$VERSION"
echo "plan=$PLAN"
"$TF" apply "$PLAN"
