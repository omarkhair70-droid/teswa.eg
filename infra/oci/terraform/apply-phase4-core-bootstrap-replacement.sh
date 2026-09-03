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

echo "OUT_OF_HOST_CAPACITY BLOCK: this replacement path is disabled while fresh A1 capacity is unavailable." >&2
echo "Use the boot-volume rescue path instead; do not destroy teswa-core-01." >&2
exit 9

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
echo
echo "Running immediate host-capacity safety preflight before destructive replacement..."
bash "$(dirname "${BASH_SOURCE[0]}")/preflight-phase4-core-replacement-capacity.sh"
echo
"$TF" apply "$PLAN"
