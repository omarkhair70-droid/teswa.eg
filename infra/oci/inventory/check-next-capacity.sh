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

echo "TESWA OCI NEXT CAPACITY CHECK"
echo "region=me-jeddah-1"
echo "mode=read-only"
echo

echo "[compute_a1]"
A1_LIMIT="standard-a1-core-regional-count"
set +e
RAW="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name compute   --limit-name "$A1_LIMIT"   --output json 2>/tmp/teswa-capacity-$A1_LIMIT.err)"
RC=$?
set -e
if [ "$RC" -eq 0 ] && [ -n "$(printf '%s' "$RAW" | tr -d '[:space:]')" ]; then
  printf '%s' "$RAW" | python3 -c 'import json,sys; p=json.load(sys.stdin).get("data",{}); print("limit=%s available=%s used=%s" % (sys.argv[1],p.get("available"),p.get("used")))' "$A1_LIMIT"
else
  echo "limit=$A1_LIMIT status=unavailable"
fi

echo
echo "[compute_e2_micro]"
ADS_JSON="$(oci iam availability-domain list --compartment-id "$TENANCY_OCID" --all --output json)"
mapfile -t ADS < <(printf '%s' "$ADS_JSON" | python3 -c 'import json,sys; [print(x.get("name")) for x in json.load(sys.stdin).get("data",[]) if x.get("name")]')

COMPUTE_VALUES="$(oci limits value list   --compartment-id "$TENANCY_OCID"   --service-name compute   --all   --output json)"

mapfile -t E2_LIMITS < <(printf '%s' "$COMPUTE_VALUES" | python3 -c '
import json,sys
rows=json.load(sys.stdin).get("data",[])
for r in rows:
    name=(r.get("name") or "")
    if "e2" in name.lower() and "micro" in name.lower():
        print("%s\t%s\t%s" % (name, r.get("scope-type") or "", r.get("value")))
')

if [ "${#E2_LIMITS[@]}" -eq 0 ]; then
  echo "e2_micro_limit_discovery=none"
else
  for ROW in "${E2_LIMITS[@]}"; do
    IFS=
echo
echo "[teswa_current_resources]"
for KIND in compute boot block lb; do
  case "$KIND" in
    compute)
      CMD=(oci compute instance list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    boot)
      CMD=(oci bv boot-volume list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    block)
      CMD=(oci bv volume list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    lb)
      CMD=(oci lb load-balancer list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
  esac

  set +e
  RAW="$("${CMD[@]}" 2>/dev/null)"
  RC=$?
  set -e

  if [ "$RC" -eq 0 ]; then
    if [ -z "$(printf '%s' "$RAW" | tr -d '[:space:]')" ]; then
      COUNT=0
    else
      COUNT="$(printf '%s' "$RAW" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("data",[])))')"
    fi
    echo "$KIND=$COUNT"
  else
    echo "$KIND=UNKNOWN"
  fi
done

echo
echo "[relevant_service_limits]"
SERVICES_JSON="$(oci limits service list --compartment-id "$TENANCY_OCID" --all --output json)"

printf '%s' "$SERVICES_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",[]); [print(x.get("name")) for x in d if any(k in (x.get("name") or "").lower() for k in ("block","load","object","vault"))]' |
while IFS= read -r SERVICE; do
  [ -n "$SERVICE" ] || continue

  set +e
  VALUES="$(oci limits value list     --compartment-id "$TENANCY_OCID"     --service-name "$SERVICE"     --all     --output json 2>/dev/null)"
  RC=$?
  set -e

  [ "$RC" -eq 0 ] || continue
  [ -n "$(printf '%s' "$VALUES" | tr -d '[:space:]')" ] || continue

  printf '%s' "$VALUES" | python3 -c '
import json,sys
service=sys.argv[1]
rows=json.load(sys.stdin).get("data",[])
keys=("10mbps","volume","backup","storage","secret","vault")
for r in rows:
    name=(r.get("name") or "")
    if any(k in name.lower() for k in keys):
        print("service=%s limit=%s value=%s scope=%s" % (service,name,r.get("value"),r.get("scope-type")))
' "$SERVICE"
done

echo
echo "No OCI resources were changed."
echo "Use this output only for the next topology/cost decision; service limits are not the same thing as Always Free billing entitlement."
\t' read -r LIMIT SCOPE VALUE <<<"$ROW"
    echo "service_limit=$LIMIT value=$VALUE scope=$SCOPE"

    if [ "$SCOPE" = "AD" ]; then
      for AD in "${ADS[@]}"; do
        set +e
        AVAIL="$(oci limits resource-availability get           --compartment-id "$TENANCY_OCID"           --service-name compute           --limit-name "$LIMIT"           --availability-domain "$AD"           --output json 2>/tmp/teswa-capacity-e2.err)"
        AVAIL_RC=$?
        set -e

        if [ "$AVAIL_RC" -eq 0 ] && [ -n "$(printf '%s' "$AVAIL" | tr -d '[:space:]')" ]; then
          printf '%s' "$AVAIL" | python3 -c 'import json,sys; p=json.load(sys.stdin).get("data",{}); print("ad=%s limit=%s available=%s used=%s" % (sys.argv[1],sys.argv[2],p.get("available"),p.get("used")))' "$AD" "$LIMIT"
        else
          echo "ad=$AD limit=$LIMIT availability_api=unsupported_or_unavailable"
        fi
      done
    fi
  done
fi

echo
echo "[always_free_specific_limits]"
for SPEC in   "block-storage:total-free-storage-gb-regional"   "block-storage:free-backup-count"   "load-balancer:lb-10mbps-micro-count"; do
  SERVICE="${SPEC%%:*}"
  LIMIT="${SPEC#*:}"

  set +e
  AVAIL="$(oci limits resource-availability get     --compartment-id "$TENANCY_OCID"     --service-name "$SERVICE"     --limit-name "$LIMIT"     --output json 2>/tmp/teswa-free-limit.err)"
  AVAIL_RC=$?
  set -e

  if [ "$AVAIL_RC" -eq 0 ] && [ -n "$(printf '%s' "$AVAIL" | tr -d '[:space:]')" ]; then
    printf '%s' "$AVAIL" | python3 -c 'import json,sys; p=json.load(sys.stdin).get("data",{}); print("service=%s limit=%s available=%s used=%s" % (sys.argv[1],sys.argv[2],p.get("available"),p.get("used")))' "$SERVICE" "$LIMIT"
  else
    echo "service=$SERVICE limit=$LIMIT availability_api=unsupported_or_unavailable"
  fi
done

echo
echo "[teswa_current_resources]"
for KIND in compute boot block lb; do
  case "$KIND" in
    compute)
      CMD=(oci compute instance list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    boot)
      CMD=(oci bv boot-volume list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    block)
      CMD=(oci bv volume list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
    lb)
      CMD=(oci lb load-balancer list --compartment-id "$TESWA_COMPARTMENT" --all --output json)
      ;;
  esac

  set +e
  RAW="$("${CMD[@]}" 2>/dev/null)"
  RC=$?
  set -e

  if [ "$RC" -eq 0 ]; then
    if [ -z "$(printf '%s' "$RAW" | tr -d '[:space:]')" ]; then
      COUNT=0
    else
      COUNT="$(printf '%s' "$RAW" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("data",[])))')"
    fi
    echo "$KIND=$COUNT"
  else
    echo "$KIND=UNKNOWN"
  fi
done

echo
echo "[relevant_service_limits]"
SERVICES_JSON="$(oci limits service list --compartment-id "$TENANCY_OCID" --all --output json)"

printf '%s' "$SERVICES_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",[]); [print(x.get("name")) for x in d if any(k in (x.get("name") or "").lower() for k in ("block","load","object","vault"))]' |
while IFS= read -r SERVICE; do
  [ -n "$SERVICE" ] || continue

  set +e
  VALUES="$(oci limits value list     --compartment-id "$TENANCY_OCID"     --service-name "$SERVICE"     --all     --output json 2>/dev/null)"
  RC=$?
  set -e

  [ "$RC" -eq 0 ] || continue
  [ -n "$(printf '%s' "$VALUES" | tr -d '[:space:]')" ] || continue

  printf '%s' "$VALUES" | python3 -c '
import json,sys
service=sys.argv[1]
rows=json.load(sys.stdin).get("data",[])
keys=("10mbps","volume","backup","storage","secret","vault")
for r in rows:
    name=(r.get("name") or "")
    if any(k in name.lower() for k in keys):
        print("service=%s limit=%s value=%s scope=%s" % (service,name,r.get("value"),r.get("scope-type")))
' "$SERVICE"
done

echo
echo "No OCI resources were changed."
echo "Use this output only for the next topology/cost decision; service limits are not the same thing as Always Free billing entitlement."
