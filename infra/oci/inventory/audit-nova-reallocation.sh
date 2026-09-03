#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
INSTANCE_NAME="${NOVA_INSTANCE_NAME:-nova-backend}"

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
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

if [ -z "$TENANCY_OCID" ]; then
  echo "Could not discover tenancy OCID from terraform.tfvars." >&2
  exit 2
fi

echo "NOVA RESOURCE REALLOCATION AUDIT"
echo "mode=read-only"
echo "target=$INSTANCE_NAME"
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
  raw="$(oci compute instance list     --compartment-id "$compartment"     --display-name "$INSTANCE_NAME"     --lifecycle-state RUNNING     --all     --output json 2>/dev/null)"
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

if [ -z "$INSTANCE_JSON" ]; then
  echo "nova_instance=not_found"
  exit 3
fi

readarray -t I < <(
  printf '%s' "$INSTANCE_JSON" | python3 -c '
import json,sys
rows=json.load(sys.stdin).get("data",[])
if len(rows)!=1:
    raise SystemExit("expected exactly one running target")
x=rows[0]
shape=x.get("shape-config") or {}
print(x.get("id",""))
print(x.get("compartment-id",""))
print(x.get("availability-domain",""))
print(x.get("shape",""))
print(shape.get("ocpus",""))
print(shape.get("memory-in-gbs",""))
print(x.get("lifecycle-state",""))
'
)

INSTANCE_ID="${I[0]}"
INSTANCE_COMPARTMENT="${I[1]}"
AD="${I[2]}"
SHAPE="${I[3]}"
OCPUS="${I[4]}"
MEMORY_GB="${I[5]}"
STATE="${I[6]}"

echo "instance=$INSTANCE_NAME"
echo "shape=$SHAPE"
echo "ocpu=$OCPUS"
echo "memory_gb=$MEMORY_GB"
echo "state=$STATE"

ATTACH_JSON="$(oci compute boot-volume-attachment list   --availability-domain "$AD"   --compartment-id "$INSTANCE_COMPARTMENT"   --instance-id "$INSTANCE_ID"   --all   --output json)"

BOOT_ID="$(printf '%s' "$ATTACH_JSON" | python3 -c '
import json,sys
for x in json.load(sys.stdin).get("data",[]):
    if x.get("lifecycle-state")=="ATTACHED" and x.get("boot-volume-id"):
        print(x["boot-volume-id"])
        break
')"

if [ -n "$BOOT_ID" ]; then
  BOOT_JSON="$(oci bv boot-volume get --boot-volume-id "$BOOT_ID" --output json)"
  printf '%s' "$BOOT_JSON" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("boot_volume_gb=%s" % p.get("size-in-gbs"))
print("boot_vpus_per_gb=%s" % p.get("vpus-per-gb"))
'
else
  echo "boot_volume_gb=UNKNOWN"
fi

metric_summary() {
  local namespace="$1"
  local metric="$2"
  local label="$3"
  local days="$4"

  local start end query raw rc
  readarray -t T < <(python3 - "$days" <<'PY'
from datetime import datetime, timedelta, timezone
import sys
days=int(sys.argv[1])
end=datetime.now(timezone.utc)
start=end-timedelta(days=days)
print(start.isoformat().replace("+00:00","Z"))
print(end.isoformat().replace("+00:00","Z"))
PY
)
  start="${T[0]}"
  end="${T[1]}"
  query="$metric[5m]{resourceId = \"$INSTANCE_ID\"}.mean()"

  set +e
  raw="$(oci monitoring metric-data summarize-metrics-data     --compartment-id "$INSTANCE_COMPARTMENT"     --namespace "$namespace"     --query-text "$query"     --start-time "$start"     --end-time "$end"     --output json 2>/tmp/nova-metric.err)"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ] || [ -z "$(printf '%s' "$raw" | tr -d '[:space:]')" ]; then
    echo "$label=unavailable"
    return 0
  fi

  printf '%s' "$raw" | python3 - "$label" <<'PY'
import json,sys
label=sys.argv[1]
payload=json.load(sys.stdin)
values=[]
for stream in payload.get("data",[]):
    for p in stream.get("aggregated-datapoints",[]) or []:
        v=p.get("value")
        if isinstance(v,(int,float)):
            values.append(float(v))
if not values:
    print(f"{label}=unavailable")
else:
    print(f"{label}_samples={len(values)}")
    print(f"{label}_avg={sum(values)/len(values):.2f}")
    print(f"{label}_max={max(values):.2f}")
PY
}

echo
echo "[last_7_days_metrics]"
metric_summary "oci_computeagent" "CpuUtilization" "cpu_pct" 7
metric_summary "oci_computeagent" "MemoryUtilization" "memory_pct" 7

# Agentless CPU is a useful fallback if the Compute Agent metric is absent.
metric_summary "oci_vmi_resource_utilization" "CpuUtilization" "agentless_cpu_pct" 7

echo
echo "[reallocation_boundaries]"
echo "teswa_priority=true"
echo "nova_changes_applied=false"
echo "candidate_a=resize Nova only after metrics review"
echo "candidate_b=stop/reallocate Nova only after explicit impact review"
echo
echo "No Nova or Teswa OCI resources were changed."
