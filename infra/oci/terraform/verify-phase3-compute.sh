#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
[ -f "$VARS" ] || { echo "Missing $VARS." >&2; exit 2; }

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
[ -n "$TENANCY_OCID" ] || { echo "Could not discover tenancy OCID." >&2; exit 3; }

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

echo "TESWA OCI PHASE 3 COMPUTE VERIFY"

instance_check() {
  local name="$1"
  local expected_shape="$2"
  local expected_ocpu="$3"
  local expected_mem="$4"

  local raw
  raw="$(oci compute instance list     --compartment-id "$COMPARTMENT"     --display-name "$name"     --all     --output json)"

  printf '%s' "$raw" | python3 -c '
import json,sys
name,shape,ocpu,mem=sys.argv[1:]
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")]
if len(rows)!=1:
    print("instance=%s count=%d verify=FAIL" % (name,len(rows)))
    raise SystemExit(4)
x=rows[0]
cfg=x.get("shape-config") or {}
state=x.get("lifecycle-state")
actual_shape=x.get("shape")
actual_ocpu=cfg.get("ocpus")
actual_mem=cfg.get("memory-in-gbs")
print("instance=%s state=%s shape=%s ocpu=%s memory_gb=%s" % (
    name,state,actual_shape,actual_ocpu,actual_mem
))
if state!="RUNNING" or actual_shape!=shape:
    raise SystemExit(5)
if ocpu!="skip" and float(actual_ocpu or 0)!=float(ocpu):
    raise SystemExit(6)
if mem!="skip" and float(actual_mem or 0)!=float(mem):
    raise SystemExit(7)
' "$name" "$expected_shape" "$expected_ocpu" "$expected_mem"
}

instance_check "teswa-core-01" "VM.Standard.A1.Flex" "1" "6"
instance_check "teswa-edge-01" "VM.Standard.E2.1.Micro" "skip" "skip"

EDGE_IP="$("$TF" output -raw teswa_edge_public_ip)"
CORE_IP="$("$TF" output -raw teswa_core_private_ip)"

[ -n "$EDGE_IP" ] || { echo "edge_public_ip=missing"; exit 8; }
[ -n "$CORE_IP" ] || { echo "core_private_ip=missing"; exit 9; }

echo "edge_public_ip=assigned"
echo "core_private_ip=assigned"

NAT_JSON="$(oci network nat-gateway list   --compartment-id "$COMPARTMENT"   --display-name "teswa-app-nat"   --all   --output json)"

printf '%s' "$NAT_JSON" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")]
if len(rows)!=1:
    print("nat_gateway_count=%d" % len(rows))
    raise SystemExit(10)
state=rows[0].get("lifecycle-state")
print("nat_gateway_state=%s" % state)
if state!="AVAILABLE":
    raise SystemExit(11)
'

AD_JSON="$(oci iam availability-domain list --compartment-id "$TENANCY_OCID" --all --output json)"
AD="$(printf '%s' "$AD_JSON" | python3 -c 'import json,sys; rows=json.load(sys.stdin).get("data",[]); print(rows[0].get("name","") if rows else "")')"

A1="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name compute   --limit-name standard-a1-core-regional-count   --output json)"
printf '%s' "$A1" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("a1_service_used=%s" % p.get("used"))
if float(p.get("used") or 0)!=2:
    raise SystemExit(12)
'

E2="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name compute   --limit-name vm-standard-e2-1-micro-count   --availability-domain "$AD"   --output json)"
printf '%s' "$E2" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("e2_micro_used=%s" % p.get("used"))
if float(p.get("used") or 0)!=1:
    raise SystemExit(13)
'

BS="$(oci limits resource-availability get   --compartment-id "$TENANCY_OCID"   --service-name block-storage   --limit-name total-free-storage-gb-regional   --output json)"
printf '%s' "$BS" | python3 -c '
import json,sys
p=json.load(sys.stdin).get("data",{})
print("free_block_storage_available_gb=%s" % p.get("available"))
print("free_block_storage_used_gb=%s" % p.get("used"))
'

echo
echo "Terraform drift check:"
set +e
"$TF" plan -var-file="$VARS" -detailed-exitcode -no-color >/tmp/teswa-phase3-postapply-plan.txt
RC=$?
set -e

case "$RC" in
  0) echo "terraform_drift=none" ;;
  2)
    echo "terraform_drift=changes_detected"
    tail -n 100 /tmp/teswa-phase3-postapply-plan.txt
    exit 14
    ;;
  *)
    echo "terraform_plan=error"
    tail -n 100 /tmp/teswa-phase3-postapply-plan.txt
    exit "$RC"
    ;;
esac

echo
echo "phase3_verify=PASS"
echo "No secret values or OCIDs are intentionally printed."
