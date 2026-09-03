#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_PHASE4_CORE_BOOTSTRAP_PLAN:-teswa-phase4-core-bootstrap-replacement.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
[ -f "$PLAN" ] || { echo "Missing reviewed saved plan: $PLAN" >&2; exit 2; }

VERSION="$("$TF" version | head -n1)"
[ "$VERSION" = "Terraform v1.16.0" ] || {
  echo "Refusing apply: reviewed plan requires Terraform v1.16.0; found $VERSION" >&2
  exit 3
}

if [ "${TESWA_ALLOW_CORE_REPLACEMENT:-}" != "YES" ]; then
  echo "Refusing Core replacement: set TESWA_ALLOW_CORE_REPLACEMENT=YES after reviewing the saved plan." >&2
  exit 4
fi

echo "TESWA PHASE 4 CORE BOOTSTRAP REPLACEMENT APPLY"
echo "target=teswa-core-01"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"
echo "terraform=$VERSION"
echo "plan=$PLAN"

"$TF" apply "$PLAN"
