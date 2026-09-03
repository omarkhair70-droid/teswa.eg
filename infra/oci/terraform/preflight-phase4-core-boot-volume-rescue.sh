#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

[ -n "$CORE_ID" ] && [ "$CORE_ID" != "null" ] || {
  echo "rescue_preflight=FAIL reason=core_not_running" >&2
  exit 2
}

CORE_JSON="$(mktemp)"
BOOT_ATTACH_JSON="$(mktemp)"
E2_REPORT="$(mktemp)"
E2_SHAPE_JSON="$(mktemp)"
STORAGE_JSON="$(mktemp)"
E2_LIMIT_JSON="$(mktemp)"
trap 'rm -f "$CORE_JSON" "$BOOT_ATTACH_JSON" "$E2_REPORT" "$E2_SHAPE_JSON" "$STORAGE_JSON" "$E2_LIMIT_JSON"' EXIT

oci compute instance get --instance-id "$CORE_ID" --output json >"$CORE_JSON"

AD="$(python3 - "$CORE_JSON" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8")).get("data",{})
print(d.get("availability-domain",""))
PY
)"

[ -n "$AD" ] || {
  echo "rescue_preflight=FAIL reason=core_availability_domain_missing" >&2
  exit 3
}

oci compute boot-volume-attachment list   --availability-domain "$AD"   --compartment-id "$COMPARTMENT"   --instance-id "$CORE_ID"   --all   --output json >"$BOOT_ATTACH_JSON"

BOOT_VOLUME_ID="$(python3 - "$BOOT_ATTACH_JSON" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1],encoding="utf-8")).get("data",[])
active=[r for r in rows if (r.get("lifecycle-state") or "") not in ("DETACHED","TERMINATED")]
ids=[r.get("boot-volume-id") for r in active if r.get("boot-volume-id")]
if len(ids)==1:
    print(ids[0])
PY
)"

[ -n "$BOOT_VOLUME_ID" ] && [ "$BOOT_VOLUME_ID" != "null" ] || {
  echo "rescue_preflight=FAIL reason=core_boot_volume_attachment_not_resolved" >&2
  exit 3
}

echo "core_availability_domain_detected=true"
echo "core_boot_volume_attachment_resolved=true"

TENANCY="$(oci iam compartment get   --compartment-id "$COMPARTMENT"   --query 'data."compartment-id"'   --raw-output)"

[ -n "$TENANCY" ] && [ "$TENANCY" != "null" ] || {
  echo "rescue_preflight=FAIL reason=tenancy_resolution_failed" >&2
  exit 4
}

python3 - "$E2_SHAPE_JSON" <<'PY'
import json,sys
json.dump([{"instanceShape":"VM.Standard.E2.1.Micro"}],
          open(sys.argv[1],"w",encoding="utf-8"))
PY

echo "TESWA PHASE 4 CORE BOOT-VOLUME RESCUE PREFLIGHT"
echo "mutation=none"
echo "core_replacement=blocked"
echo "rescue_strategy=temporary_e2_helper_plus_existing_core_boot_volume"
echo "helper_shape=VM.Standard.E2.1.Micro"
echo "helper_boot_gb=47"
echo "preserve_core_instance=true"
echo "preserve_core_boot_volume=true"
echo

set +e
oci limits resource-availability get   --compartment-id "$TENANCY"   --service-name compute   --limit-name vm-standard-e2-1-micro-count   --output json >"$E2_LIMIT_JSON" 2>/tmp/teswa-e2-limit.err
LIMIT_RC=$?
set -e

if [ "$LIMIT_RC" -ne 0 ]; then
  echo "rescue_preflight=FAIL reason=e2_limit_availability_query_failed"
  cat /tmp/teswa-e2-limit.err >&2 || true
  exit 5
fi

python3 - "$E2_LIMIT_JSON" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8")).get("data",{})
a=d.get("available")
fa=d.get("fractional-available")
u=d.get("used")
print("e2_limit_available="+str(a))
print("e2_limit_fractional_available="+str(fa))
print("e2_limit_used="+str(u))
avail=fa if fa is not None else a
if avail is None or float(avail) < 1:
    print("rescue_preflight=FAIL reason=no_e2_service_limit")
    raise SystemExit(6)
PY

set +e
oci limits resource-availability get   --compartment-id "$TENANCY"   --service-name block-storage   --limit-name total-free-storage-gb-regional   --output json >"$STORAGE_JSON" 2>/tmp/teswa-storage-limit.err
STORAGE_RC=$?
set -e

if [ "$STORAGE_RC" -ne 0 ]; then
  echo "rescue_preflight=FAIL reason=free_storage_query_failed"
  cat /tmp/teswa-storage-limit.err >&2 || true
  exit 7
fi

python3 - "$STORAGE_JSON" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8")).get("data",{})
a=d.get("available")
fa=d.get("fractional-available")
u=d.get("used")
print("free_storage_gb_available="+str(a))
print("free_storage_gb_fractional_available="+str(fa))
print("free_storage_gb_used="+str(u))
avail=fa if fa is not None else a
if avail is None or float(avail) < 47:
    print("rescue_preflight=FAIL reason=insufficient_free_boot_storage")
    raise SystemExit(8)
PY

oci compute compute-capacity-report create   --availability-domain "$AD"   --compartment-id "$TENANCY"   --shape-availabilities "file://$E2_SHAPE_JSON"   --output json >"$E2_REPORT"

python3 - "$E2_REPORT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding="utf-8")).get("data",{})
rows=d.get("shape-availabilities") or d.get("shapeAvailabilities") or []
if not rows:
    print("rescue_preflight=FAIL reason=no_e2_shape_availability")
    raise SystemExit(9)
r=rows[0]
status=r.get("availability-status") or r.get("availabilityStatus") or ""
count=r.get("available-count")
if count is None:
    count=r.get("availableCount")
print("e2_capacity_status="+str(status))
print("e2_available_count="+str(count))
if status!="AVAILABLE":
    print("rescue_preflight=FAIL reason=e2_"+str(status or "unknown"))
    raise SystemExit(10)
if count is not None and int(count) < 1:
    print("rescue_preflight=FAIL reason=e2_available_count_zero")
    raise SystemExit(11)
print("core_boot_volume_detected=true")
print("same_availability_domain=true")
print("rescue_preflight=PASS")
print("No OCI compute, volume, or network resources were changed.")
PY
