#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
LOCAL_VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"

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
[ -n "$TENANCY_OCID" ] || { echo "Could not discover tenancy OCID." >&2; exit 1; }

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
VCN="$("$TF" output -raw teswa_vcn_id)"

AD_JSON="$(oci iam availability-domain list --compartment-id "$TENANCY_OCID" --all --output json)"
AD="$(printf '%s' "$AD_JSON" | python3 -c 'import json,sys; rows=json.load(sys.stdin).get("data",[]); print(rows[0].get("name","") if rows else "")')"
[ -n "$AD" ] || { echo "availability_domain=missing" >&2; exit 2; }

echo "TESWA OCI PHASE 3 COMPUTE PREFLIGHT"
echo "mode=read-only"
echo "availability_domain=$AD"

A1="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name compute   --limit-name standard-a1-core-regional-count   --output json)"
printf '%s' "$A1" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("a1_service_available=%s" % p.get("available"))
print("a1_service_used=%s" % p.get("used"))
if float(p.get("used") or 0) != 1:
    raise SystemExit("Expected Nova to use exactly 1 A1 OCPU before Teswa Phase 3.")
'

E2="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name compute   --limit-name vm-standard-e2-1-micro-count   --availability-domain "$AD"   --output json)"
printf '%s' "$E2" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("e2_micro_available=%s" % p.get("available"))
print("e2_micro_used=%s" % p.get("used"))
if float(p.get("available") or 0) < 1:
    raise SystemExit("No E2 Micro slot available.")
'

BS="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name block-storage   --limit-name total-free-storage-gb-regional   --output json)"
printf '%s' "$BS" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
available=float(p.get("available") or 0)
used=float(p.get("used") or 0)
print("free_block_storage_available_gb=%g" % available)
print("free_block_storage_used_gb=%g" % used)
if available < 100:
    raise SystemExit("Phase 3 requires 100 GB for two 50 GB boot volumes.")
'

set +e
NAT_JSON="$(oci network nat-gateway list   --compartment-id "$COMPARTMENT"   --vcn-id "$VCN"   --all   --output json 2>/tmp/teswa-phase3-nat.err)"
NAT_RC=$?
set -e

if [ "$NAT_RC" -ne 0 ]; then
  echo "nat_gateway_check=ERROR" >&2
  cat /tmp/teswa-phase3-nat.err >&2
  exit 3
fi

if [ -z "$(printf '%s' "$NAT_JSON" | tr -d '[:space:]')" ]; then
  echo "existing_teswa_nat_gateways=0"
else
  printf '%s' "$NAT_JSON" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")]
print("existing_teswa_nat_gateways=%d" % len(rows))
if rows:
    raise SystemExit("Teswa VCN already has a NAT gateway; stop before planning a duplicate.")
'
fi

CORE_IMAGE_JSON="$(oci compute image list   --compartment-id "$TENANCY_OCID"   --operating-system "Oracle Linux"   --operating-system-version "9"   --shape "VM.Standard.A1.Flex"   --sort-by TIMECREATED   --sort-order DESC   --limit 1   --output json)"

EDGE_IMAGE_JSON="$(oci compute image list   --compartment-id "$TENANCY_OCID"   --operating-system "Oracle Linux"   --operating-system-version "9"   --shape "VM.Standard.E2.1.Micro"   --sort-by TIMECREATED   --sort-order DESC   --limit 1   --output json)"

CORE_IMAGE="$(printf '%s' "$CORE_IMAGE_JSON" | python3 -c 'import json,sys; rows=json.load(sys.stdin).get("data",[]); print(rows[0].get("id","") if rows else "")')"
EDGE_IMAGE="$(printf '%s' "$EDGE_IMAGE_JSON" | python3 -c 'import json,sys; rows=json.load(sys.stdin).get("data",[]); print(rows[0].get("id","") if rows else "")')"
CORE_NAME="$(printf '%s' "$CORE_IMAGE_JSON" | python3 -c 'import json,sys; rows=json.load(sys.stdin).get("data",[]); print(rows[0].get("display-name","") if rows else "")')"
EDGE_NAME="$(printf '%s' "$EDGE_IMAGE_JSON" | python3 -c 'import json,sys; rows=json.load(sys.stdin).get("data",[]); print(rows[0].get("display-name","") if rows else "")')"

[ -n "$CORE_IMAGE" ] || { echo "core_image=missing" >&2; exit 3; }
[ -n "$EDGE_IMAGE" ] || { echo "edge_image=missing" >&2; exit 4; }

cat >"$LOCAL_VARS" <<EOF
enable_object_storage = true
enable_vault           = true
enable_notifications   = true
enable_compute_phase3  = true

core_image_ocid = "$CORE_IMAGE"
edge_image_ocid = "$EDGE_IMAGE"
EOF
chmod 600 "$LOCAL_VARS"

echo "core_image=$CORE_NAME"
echo "edge_image=$EDGE_NAME"
echo "local_var_file=$LOCAL_VARS"
echo "local_var_file_permissions=600"
echo "preflight=PASS"
echo "No OCI resources were changed."
