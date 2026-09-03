#!/usr/bin/env bash
set -Eeuo pipefail

PROFILE="${OCI_CLI_PROFILE:-DEFAULT}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${ROOT}/out/${STAMP}"
mkdir -p "${OUT}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need oci
need python3

oci_cmd() {
  oci --profile "${PROFILE}" "$@"
}

json_or_error() {
  local file="$1"
  shift
  if "$@" --output json >"${file}" 2>"${file}.err"; then
    rm -f "${file}.err"
  else
    python3 - <<PY >"${file}"
import json
from pathlib import Path
p = Path(r"${file}.err")
print(json.dumps({"status": "unavailable", "error": p.read_text(errors="replace") if p.exists() else "unknown error"}, indent=2))
PY
    rm -f "${file}.err"
  fi
}

config_tenancy() {
  python3 - "${PROFILE}" <<'PY'
import configparser, os, sys
profile = sys.argv[1]
path = os.path.expanduser(os.environ.get("OCI_CLI_CONFIG_FILE", "~/.oci/config"))
cp = configparser.ConfigParser()
cp.read(path)
if profile in cp and cp[profile].get("tenancy"):
    print(cp[profile]["tenancy"].strip())
PY
}

TENANCY_OCID="${TENANCY_OCID:-$(config_tenancy || true)}"
if [[ -z "${TENANCY_OCID}" ]]; then
  echo "Could not determine tenancy OCID. Set TENANCY_OCID or configure OCI CLI profile ${PROFILE}." >&2
  exit 1
fi

cat >"${OUT}/README.txt" <<EOF
Teswa OCI read-only inventory
UTC timestamp: ${STAMP}
OCI profile: ${PROFILE}
Tenancy OCID: ${TENANCY_OCID}
No create/update/delete commands are used by this collector.
EOF

oci --version >"${OUT}/oci-cli-version.txt" 2>&1 || true

json_or_error "${OUT}/tenancy.json" oci_cmd iam tenancy get --tenancy-id "${TENANCY_OCID}"
json_or_error "${OUT}/regions.json" oci_cmd iam region-subscription list --tenancy-id "${TENANCY_OCID}" --all
json_or_error "${OUT}/availability-domains.json" oci_cmd iam availability-domain list --compartment-id "${TENANCY_OCID}" --all
json_or_error "${OUT}/compartments.json" oci_cmd iam compartment list --compartment-id "${TENANCY_OCID}" --compartment-id-in-subtree true --access-level ACCESSIBLE --lifecycle-state ACTIVE --all
json_or_error "${OUT}/quotas.json" oci_cmd limits quota list --compartment-id "${TENANCY_OCID}" --all
json_or_error "${OUT}/limit-services.json" oci_cmd limits service list --compartment-id "${TENANCY_OCID}" --all

python3 - "${OUT}/compartments.json" "${TENANCY_OCID}" >"${OUT}/compartment-ids.txt" <<'PY'
import json, sys
path, root = sys.argv[1], sys.argv[2]
print(root)
try:
    payload = json.load(open(path, encoding="utf-8"))
    for row in payload.get("data", []):
        cid = row.get("id")
        if cid:
            print(cid)
except Exception:
    pass
PY

python3 - "${OUT}/limit-services.json" >"${OUT}/limit-service-names.txt" <<'PY'
import json, sys
try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
    for row in payload.get("data", []):
        name = row.get("name")
        if name:
            print(name)
except Exception:
    pass
PY

mkdir -p "${OUT}/limits"
while IFS= read -r service; do
  [[ -n "${service}" ]] || continue
  safe="$(printf '%s' "${service}" | tr '/ ' '__')"
  json_or_error "${OUT}/limits/${safe}.json" oci_cmd limits value list --compartment-id "${TENANCY_OCID}" --service-name "${service}" --all
done <"${OUT}/limit-service-names.txt"

mkdir -p "${OUT}/resources"
INDEX=0
while IFS= read -r compartment; do
  [[ -n "${compartment}" ]] || continue
  INDEX=$((INDEX + 1))
  prefix="${OUT}/resources/c${INDEX}"

  json_or_error "${prefix}-compute.json" oci_cmd compute instance list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-boot-volumes.json" oci_cmd bv boot-volume list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-block-volumes.json" oci_cmd bv volume list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-vcns.json" oci_cmd network vcn list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-subnets.json" oci_cmd network subnet list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-nsgs.json" oci_cmd network nsg list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-security-lists.json" oci_cmd network security-list list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-load-balancers.json" oci_cmd lb load-balancer list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-vaults.json" oci_cmd kms management vault list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-alarms.json" oci_cmd monitoring alarm list --compartment-id "${compartment}" --all
  json_or_error "${prefix}-notification-topics.json" oci_cmd ons topic list --compartment-id "${compartment}" --all
done <"${OUT}/compartment-ids.txt"

json_or_error "${OUT}/object-storage-namespace.json" oci_cmd os ns get
NAMESPACE="$(python3 - "${OUT}/object-storage-namespace.json" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8")).get("data")
    if isinstance(data, str):
        print(data)
except Exception:
    pass
PY
)"

if [[ -n "${NAMESPACE}" ]]; then
  INDEX=0
  while IFS= read -r compartment; do
    [[ -n "${compartment}" ]] || continue
    INDEX=$((INDEX + 1))
    json_or_error "${OUT}/resources/c${INDEX}-buckets.json" oci_cmd os bucket list --namespace-name "${NAMESPACE}" --compartment-id "${compartment}" --all
  done <"${OUT}/compartment-ids.txt"
fi

python3 - "${OUT}" <<'PY'
import json, pathlib, sys
out = pathlib.Path(sys.argv[1])
summary = {
    "inventory_path": str(out),
    "note": "Read-only snapshot. Review limits/*.json and resources/*.json before choosing topology.",
}
try:
    services = json.load(open(out / "limit-services.json", encoding="utf-8")).get("data", [])
    summary["limit_services_count"] = len(services)
except Exception:
    pass
try:
    compartments = json.load(open(out / "compartments.json", encoding="utf-8")).get("data", [])
    summary["active_subcompartments_count"] = len(compartments)
except Exception:
    pass
with open(out / "summary.json", "w", encoding="utf-8") as f:
    json.dump(summary, f, indent=2)
print(json.dumps(summary, indent=2))
PY

echo
echo "Inventory complete: ${OUT}"
echo "Do not commit this output. It can contain OCIDs, IPs, and resource metadata."
