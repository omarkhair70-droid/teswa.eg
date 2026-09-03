#!/usr/bin/env bash
set -Eeuo pipefail

INSTANCE_NAME="${NOVA_INSTANCE_NAME:-nova-backend}"
TARGET_OCPUS=1
TARGET_MEMORY_GB=6
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"
POLL_SECONDS="${POLL_SECONDS:-10}"

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
  raw="$(oci compute instance list     --compartment-id "$compartment"     --display-name "$INSTANCE_NAME"     --all     --output json 2>/dev/null)"
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

[ -n "$INSTANCE_ID" ] || { echo "nova_instance=not_found" >&2; exit 2; }

echo "NOVA RESIZE VERIFY"
echo "target_instance=$INSTANCE_NAME"
echo

elapsed=0
while true; do
  INSTANCE_JSON="$(oci compute instance get --instance-id "$INSTANCE_ID" --output json)"
  readarray -t I < <(
    printf '%s' "$INSTANCE_JSON" | python3 -c '
import json,sys
x=json.load(sys.stdin).get("data",{})
s=x.get("shape-config") or {}
print(x.get("lifecycle-state",""))
print(s.get("ocpus",""))
print(s.get("memory-in-gbs",""))
print(x.get("shape",""))
'
  )
  STATE="${I[0]}"
  OCPUS="${I[1]}"
  MEMORY="${I[2]}"
  SHAPE="${I[3]}"

  echo "state=$STATE ocpu=$OCPUS memory_gb=$MEMORY"

  if [ "$STATE" = "RUNNING" ]; then
    break
  fi

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "verify=FAIL reason=timeout_waiting_for_running" >&2
    exit 3
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

python3 - "$SHAPE" "$OCPUS" "$MEMORY" <<'PY'
import sys
shape, ocpu, mem = sys.argv[1:]
ok = shape == "VM.Standard.A1.Flex" and float(ocpu) == 1.0 and float(mem) == 6.0
if not ok:
    print("resize_shape_check=FAIL")
    raise SystemExit(4)
print("resize_shape_check=PASS")
PY

echo
echo "[a1_capacity]"
set +e
CAP="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name compute   --limit-name standard-a1-core-regional-count   --output json 2>/tmp/teswa-a1-after-resize.err)"
CAP_RC=$?
set -e

if [ "$CAP_RC" -eq 0 ] && [ -n "$(printf '%s' "$CAP" | tr -d '[:space:]')" ]; then
  printf '%s' "$CAP" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("service_available=%s" % p.get("available"))
print("service_used=%s" % p.get("used"))
'
else
  echo "a1_capacity=unavailable"
fi

echo
echo "released_for_teswa_expected=1_ocpu_6gb"
echo "verify=PASS"
echo "No further OCI resources were changed."
