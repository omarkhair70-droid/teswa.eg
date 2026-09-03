#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "capacity_preflight=FAIL reason=core_not_running" >&2
  exit 2
}

CORE_JSON="$(mktemp)"
SHAPE_JSON="$(mktemp)"
REPORT_JSON="$(mktemp)"
trap 'rm -f "$CORE_JSON" "$SHAPE_JSON" "$REPORT_JSON"' EXIT

oci compute instance get --instance-id "$CORE_ID" --output json >"$CORE_JSON"

read -r AD SHAPE OCPUS MEM <<<"$(python3 - "$CORE_JSON" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8")).get("data",{})
sc=d.get("shape-config") or {}
print(d.get("availability-domain",""), d.get("shape",""), sc.get("ocpus",""), sc.get("memory-in-gbs",""))
PY
)"

if [ "$SHAPE" != "VM.Standard.A1.Flex" ] || [ "$OCPUS" != "1" ] || [ "$MEM" != "6" ]; then
  echo "capacity_preflight=FAIL reason=unexpected_core_shape" >&2
  exit 3
fi

TENANCY="$(oci iam compartment get   --compartment-id "$COMPARTMENT"   --query 'data."compartment-id"'   --raw-output)"

[ -n "$TENANCY" ] && [ "$TENANCY" != "null" ] || {
  echo "capacity_preflight=FAIL reason=tenancy_resolution_failed" >&2
  exit 4
}

python3 - "$SHAPE_JSON" <<'PY'
import json,sys
json.dump([{
  "instanceShape":"VM.Standard.A1.Flex",
  "instanceShapeConfig":{"ocpus":1,"memoryInGBs":6}
}], open(sys.argv[1],"w",encoding="utf-8"))
PY

echo "TESWA PHASE 4 CORE REPLACEMENT CAPACITY PREFLIGHT"
echo "mutation=none"
echo "shape=VM.Standard.A1.Flex"
echo "requested_ocpus=1"
echo "requested_memory_gb=6"

oci compute compute-capacity-report create   --availability-domain "$AD"   --compartment-id "$TENANCY"   --shape-availabilities "file://$SHAPE_JSON"   --output json >"$REPORT_JSON"

python3 - "$REPORT_JSON" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8")).get("data",{})
rows=d.get("shape-availabilities") or d.get("shapeAvailabilities") or []
if not rows:
    print("capacity_preflight=FAIL reason=no_shape_availability")
    raise SystemExit(5)
r=rows[0]
status=r.get("availability-status") or r.get("availabilityStatus") or ""
count=r.get("available-count")
if count is None:
    count=r.get("availableCount")
print("capacity_status="+str(status))
print("available_count="+str(count))
if status!="AVAILABLE":
    print("capacity_preflight=FAIL reason="+str(status or "unknown"))
    raise SystemExit(6)
if count is not None and int(count) < 1:
    print("capacity_preflight=FAIL reason=available_count_zero")
    raise SystemExit(7)
print("capacity_preflight=PASS")
print("No OCI compute resources were changed.")
PY
