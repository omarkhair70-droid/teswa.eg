#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only capacity snapshot for the next Teswa OCI platform decision.
# No create/update/delete operations are used.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "$ROOT/../terraform" && pwd)"
TF="${TF_BIN:-$HOME/.local/bin/terraform}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need oci
need python3

if [ ! -x "$TF" ]; then
  echo "Terraform binary not found at $TF" >&2
  exit 1
fi

cd "$TF_DIR"

TESWA_COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
TENANCY_OCID="$(python3 - <<'PY'
import re
from pathlib import Path

p = Path("terraform.tfvars")
if p.exists():
    m = re.search(r'^\s*tenancy_ocid\s*=\s*"([^"]+)"', p.read_text(), re.M)
    if m:
        print(m.group(1))
PY
)"

if [ -z "$TENANCY_OCID" ]; then
  echo "Could not discover tenancy OCID from terraform.tfvars." >&2
  exit 2
fi

nonempty() {
  [ -n "$(printf '%s' "${1:-}" | tr -d '[:space:]')" ]
}

print_availability() {
  local service="$1"
  local limit="$2"
  local ad="${3:-}"
  local raw rc

  set +e
  if [ -n "$ad" ]; then
    raw="$(oci limits resource-availability get       --compartment-id "$TENANCY_OCID"       --service-name "$service"       --limit-name "$limit"       --availability-domain "$ad"       --output json 2>/tmp/teswa-capacity.err)"
  else
    raw="$(oci limits resource-availability get       --compartment-id "$TENANCY_OCID"       --service-name "$service"       --limit-name "$limit"       --output json 2>/tmp/teswa-capacity.err)"
  fi
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    if [ -n "$ad" ]; then
      echo "ad=$ad service=$service limit=$limit availability_api=unsupported_or_unavailable"
    else
      echo "service=$service limit=$limit availability_api=unsupported_or_unavailable"
    fi
    return 0
  fi

  if ! nonempty "$raw"; then
    if [ -n "$ad" ]; then
      echo "ad=$ad service=$service limit=$limit availability_api=empty_success"
    else
      echo "service=$service limit=$limit availability_api=empty_success"
    fi
    return 0
  fi

  if [ -n "$ad" ]; then
    printf '%s' "$raw" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("ad=%s service=%s limit=%s available=%s used=%s" % (
    sys.argv[1], sys.argv[2], sys.argv[3], p.get("available"), p.get("used")
))
' "$ad" "$service" "$limit"
  else
    printf '%s' "$raw" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("service=%s limit=%s available=%s used=%s" % (
    sys.argv[1], sys.argv[2], p.get("available"), p.get("used")
))
' "$service" "$limit"
  fi
}

echo "TESWA OCI NEXT CAPACITY CHECK"
echo "region=me-jeddah-1"
echo "mode=read-only"
echo

echo "[compute_a1]"
print_availability "compute" "standard-a1-core-regional-count"

echo
echo "[compute_e2_micro]"

ADS_JSON="$(oci iam availability-domain list   --compartment-id "$TENANCY_OCID"   --all   --output json)"

mapfile -t ADS < <(
  printf '%s' "$ADS_JSON" | python3 -c '
import json,sys
for x in json.load(sys.stdin).get("data",[]):
    name=x.get("name")
    if name:
        print(name)
'
)

COMPUTE_VALUES="$(oci limits value list   --compartment-id "$TENANCY_OCID"   --service-name compute   --all   --output json)"

mapfile -t E2_LIMITS < <(
  printf '%s' "$COMPUTE_VALUES" | python3 -c '
import json,sys
for r in json.load(sys.stdin).get("data",[]):
    name=(r.get("name") or "")
    if "e2" in name.lower() and "micro" in name.lower():
        print("%s|%s|%s" % (
            name,
            r.get("scope-type") or "",
            r.get("value")
        ))
'
)

if [ "${#E2_LIMITS[@]}" -eq 0 ]; then
  echo "e2_micro_limit_discovery=none"
else
  for row in "${E2_LIMITS[@]}"; do
    IFS='|' read -r limit scope value <<<"$row"
    echo "service_limit=$limit value=$value scope=$scope"

    if [ "$scope" = "AD" ]; then
      if [ "${#ADS[@]}" -eq 0 ]; then
        echo "availability_domains=none"
      else
        for ad in "${ADS[@]}"; do
          print_availability "compute" "$limit" "$ad"
        done
      fi
    else
      print_availability "compute" "$limit"
    fi
  done
fi

echo
echo "[always_free_specific_limits]"
print_availability "block-storage" "total-free-storage-gb-regional"
print_availability "block-storage" "free-backup-count"
print_availability "load-balancer" "lb-10mbps-count"
print_availability "load-balancer" "lb-10mbps-micro-count"

echo
echo "[teswa_current_resources]"
for kind in compute boot block lb; do
  case "$kind" in
    compute)
      cmd=(oci compute instance list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    boot)
      cmd=(oci bv boot-volume list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    block)
      cmd=(oci bv volume list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    lb)
      cmd=(oci lb load-balancer list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
  esac

  set +e
  raw="$("${cmd[@]}" 2>/dev/null)"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    echo "$kind=UNKNOWN"
  elif ! nonempty "$raw"; then
    echo "$kind=0"
  else
    count="$(printf '%s' "$raw" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("data",[])))')"
    echo "$kind=$count"
  fi
done

echo
echo "[relevant_service_limits]"
SERVICES_JSON="$(oci limits service list   --compartment-id "$TENANCY_OCID"   --all   --output json)"

mapfile -t SERVICES < <(
  printf '%s' "$SERVICES_JSON" | python3 -c '
import json,sys
for x in json.load(sys.stdin).get("data",[]):
    name=(x.get("name") or "")
    if any(k in name.lower() for k in ("block","load","object","vault")):
        print(name)
'
)

for service in "${SERVICES[@]}"; do
  [ -n "$service" ] || continue

  set +e
  values="$(oci limits value list     --compartment-id "$TENANCY_OCID"     --service-name "$service"     --all     --output json 2>/dev/null)"
  rc=$?
  set -e

  [ "$rc" -eq 0 ] || continue
  nonempty "$values" || continue

  printf '%s' "$values" | python3 -c '
import json,sys
service=sys.argv[1]
rows=json.load(sys.stdin).get("data",[])
keys=("10mbps","volume","backup","storage","secret","vault")
for r in rows:
    name=(r.get("name") or "")
    if any(k in name.lower() for k in keys):
        print("service=%s limit=%s value=%s scope=%s" % (
            service,
            name,
            r.get("value"),
            r.get("scope-type")
        ))
' "$service"
done

echo
echo "No OCI resources were changed."
echo "Use this output only for the next topology/cost decision; service limits are not the same thing as Always Free billing entitlement."
