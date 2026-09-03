#!/usr/bin/env bash
set -Eeuo pipefail

INSTANCE_NAME="${NOVA_INSTANCE_NAME:-nova-backend}"
TARGET_OCPUS=1
TARGET_MEMORY_GB=6

if [ "${CONFIRM_NOVA_RESIZE:-}" != "TESWA_PRIORITY" ]; then
  echo "Refusing to resize Nova without CONFIRM_NOVA_RESIZE=TESWA_PRIORITY." >&2
  exit 1
fi

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

INSTANCE_ID=""
for compartment in "${COMPARTMENTS[@]}"; do
  set +e
  raw="$(oci compute instance list     --compartment-id "$compartment"     --display-name "$INSTANCE_NAME"     --lifecycle-state RUNNING     --all     --output json 2>/dev/null)"
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || continue
  [ -n "$(printf '%s' "$raw" | tr -d '[:space:]')" ] || continue

  INSTANCE_ID="$(printf '%s' "$raw" | python3 -c '
import json,sys
rows=json.load(sys.stdin).get("data",[])
print(rows[0].get("id","") if len(rows)==1 else "")
')"
  [ -n "$INSTANCE_ID" ] && break
done

[ -n "$INSTANCE_ID" ] || { echo "Could not identify exactly one running $INSTANCE_NAME." >&2; exit 2; }

echo "NOVA RESIZE FOR TESWA"
echo "target=1 OCPU / 6 GB"
echo "impact=Nova reboot"
echo

oci compute instance update   --instance-id "$INSTANCE_ID"   --shape-config '{"ocpus":1,"memoryInGBs":6}'   --force   >/dev/null

echo "resize_request=submitted"
echo "Wait for Nova to return RUNNING before capacity verification."
