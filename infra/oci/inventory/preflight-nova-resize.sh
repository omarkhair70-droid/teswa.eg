#!/usr/bin/env bash
set -Eeuo pipefail

INSTANCE_NAME="${NOVA_INSTANCE_NAME:-nova-backend}"
TARGET_OCPUS="${NOVA_TARGET_OCPUS:-1}"
TARGET_MEMORY_GB="${NOVA_TARGET_MEMORY_GB:-6}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"

TENANCY_OCID="$(python3 - <<'PY'
import re
from pathlib import Path
p=Path("terraform.tfvars")
if p.exists():
    m=re.search(r'^\s*tenancy_ocid\s*=\s*"([^"]+)"', p.read_text(), re.M)
    if m:
        print(m.group(1))
PY
)"

[ -n "$TENANCY_OCID" ] || { echo "Could not discover tenancy OCID." >&2; exit 1; }

echo "NOVA -> TESWA A1 REALLOCATION PREFLIGHT"
echo "mode=read-only"
echo "target_instance=$INSTANCE_NAME"
echo "target_ocpu=$TARGET_OCPUS"
echo "target_memory_gb=$TARGET_MEMORY_GB"
echo

COMPARTMENTS_JSON="$(oci iam compartment list   --compartment-id "$TENANCY_OCID"   --compartment-id-in-subtree true   --access-level ACCESSIBLE   --all   --output json)"

mapfile -t COMPARTMENTS < <(
  {
    printf '%s\n' "$TENANCY_OCID"
    printf '%s' "$COMPARTMENTS_JSON" | python3 -c '
import json,sys
for x in json.load(sys.stdin).get("data",[]):
    if x.get("lifecycle-state")=="ACTIVE" and x.get("id"):
        print(x["id"])
'
  } | awk '!seen[$0]++'
)

INSTANCE_JSON=""
for compartment in "${COMPARTMENTS[@]}"; do
  set +e
  raw="$(oci compute instance list     --compartment-id "$compartment"     --display-name "$INSTANCE_NAME"     --all     --output json 2>/dev/null)"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || continue
  [ -n "$(printf '%s' "$raw" | tr -d '[:space:]')" ] || continue

  count="$(printf '%s' "$raw" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("data",[])))')"
  if [ "$count" -gt 0 ]; then
    INSTANCE_JSON="$raw"
    break
  fi
done

[ -n "$INSTANCE_JSON" ] || { echo "preflight=FAIL reason=instance_not_found"; exit 2; }

readarray -t I < <(
  printf '%s' "$INSTANCE_JSON" | python3 -c '
import json,sys
rows=json.load(sys.stdin).get("data",[])
if len(rows)!=1:
    raise SystemExit(3)
x=rows[0]
s=x.get("shape-config") or {}
print(x.get("shape",""))
print(s.get("ocpus",""))
print(s.get("memory-in-gbs",""))
print(x.get("lifecycle-state",""))
'
)

SHAPE="${I[0]}"
CURRENT_OCPUS="${I[1]}"
CURRENT_MEMORY="${I[2]}"
STATE="${I[3]}"

echo "current_shape=$SHAPE"
echo "current_ocpu=$CURRENT_OCPUS"
echo "current_memory_gb=$CURRENT_MEMORY"
echo "state=$STATE"

if [ "$SHAPE" != "VM.Standard.A1.Flex" ] || [ "$STATE" != "RUNNING" ]; then
  echo "preflight=FAIL reason=unexpected_shape_or_state"
  exit 4
fi

python3 - "$TARGET_OCPUS" "$TARGET_MEMORY_GB" <<'PY'
import sys
ocpu=float(sys.argv[1])
mem=float(sys.argv[2])
if ocpu != 1 or mem != 6:
    raise SystemExit("This reviewed preflight is locked to 1 OCPU / 6 GB.")
PY

echo
echo "impact=reboot_required"
echo "released_for_teswa=1_ocpu_6gb"
echo "preflight=PASS"
echo "No OCI resources were changed."
