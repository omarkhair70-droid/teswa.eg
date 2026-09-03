#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
BASE_VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"
ADMIN_VARS="${TESWA_PHASE4_BASTION_VARS:-phase4-admin-bastion.local.tfvars}"
CONNECT_VARS="${TESWA_PHASE4_BASTION_CONNECTIVITY_VARS:-phase4-bastion-connectivity.local.tfvars}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_SUBNET="$("$TF" output -raw private_app_subnet_id)"
CORE_IP="$("$TF" output -raw teswa_core_private_ip)"
EGRESS_SL="$("$TF" output -raw admin_bastion_egress_security_list_id)"

echo "TESWA PHASE 4 BASTION CONNECTIVITY VERIFY"

SUBNET_FILE="$(mktemp)"
SL_FILE="$(mktemp)"
trap 'rm -f "$SUBNET_FILE" "$SL_FILE"' EXIT

oci network subnet get   --subnet-id "$APP_SUBNET"   --output json >"$SUBNET_FILE"

python3 - "$EGRESS_SL" "$SUBNET_FILE" <<'PY'
import json,sys
sl,path=sys.argv[1:]
with open(path,encoding="utf-8") as f:
    ids=json.load(f).get("data",{}).get("security-list-ids",[])
ok=sl in ids
print("egress_security_list_attached=%s" % str(ok).lower())
if not ok:
    raise SystemExit(3)
PY

SL_FILE="$(mktemp)"
trap 'rm -f "$SL_FILE"' EXIT
oci network security-list get   --security-list-id "$EGRESS_SL"   --output json >"$SL_FILE"

python3 - "$CORE_IP" "$SL_FILE" <<'PY'
import json,sys
core,path=sys.argv[1:]
with open(path,encoding="utf-8") as f:
    data=json.load(f).get("data",{})
state=data.get("lifecycle-state") or data.get("state")
rules=data.get("egress-security-rules") or []
ok=False
for r in rules:
    if r.get("protocol")!="6":
        continue
    if r.get("destination") != core+"/32":
        continue
    tcp=r.get("tcp-options") or {}
    if tcp.get("min")==22 and tcp.get("max")==22 and not r.get("is-stateless",False):
        ok=True
        break
print("security_list_state=%s" % state)
print("core_tcp22_egress_rule=%s" % str(ok).lower())
if not ok:
    raise SystemExit(4)
PY

echo
echo "Terraform drift check:"
set +e
"$TF" plan   -var-file="$BASE_VARS"   -var-file="$ADMIN_VARS"   -var-file="$CONNECT_VARS"   -detailed-exitcode   -no-color   >/tmp/teswa-phase4-bastion-connectivity-drift.txt
RC=$?
set -e

case "$RC" in
  0) echo "terraform_drift=none" ;;
  2)
    echo "terraform_drift=changes_detected"
    tail -n 80 /tmp/teswa-phase4-bastion-connectivity-drift.txt
    exit 5
    ;;
  *)
    echo "terraform_plan=error"
    tail -n 80 /tmp/teswa-phase4-bastion-connectivity-drift.txt
    exit "$RC"
    ;;
esac

echo "phase4_bastion_connectivity_verify=PASS"
