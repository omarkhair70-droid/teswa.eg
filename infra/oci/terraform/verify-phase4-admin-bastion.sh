#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
BASE_VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"
ADMIN_VARS="${TESWA_PHASE4_BASTION_VARS:-phase4-admin-bastion.local.tfvars}"
POLL_SECONDS="${POLL_SECONDS:-10}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASTION_ID="$("$TF" output -raw admin_bastion_id)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
APP_NSG="$("$TF" output -raw app_nsg_id)"

B="$(oci bastion bastion get --bastion-id "$BASTION_ID" --output json)"
ENDPOINT="$(printf '%s' "$B" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
print(d.get("private-endpoint-ip-address",""))
')"
STATE="$(printf '%s' "$B" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
print(d.get("lifecycle-state",""))
')"

echo "TESWA PHASE 4 TEMP ADMIN BASTION VERIFY"
echo "bastion_state=$STATE"
echo "private_endpoint_assigned=$([ -n "$ENDPOINT" ] && echo true || echo false)"
[ "$STATE" = "ACTIVE" ] || exit 3
[ -n "$ENDPOINT" ] || exit 4

RULES="$(oci network nsg rules list --network-security-group-id "$APP_NSG" --all --output json)"
printf '%s' "$RULES" | python3 - "$ENDPOINT" <<'PY'
import json,sys
endpoint=sys.argv[1]
rows=json.load(sys.stdin).get("data",[])
ok=False
for r in rows:
    if r.get("direction")!="INGRESS" or r.get("protocol")!="6":
        continue
    if r.get("source") != endpoint+"/32":
        continue
    tcp=r.get("tcp-options") or {}
    pr=tcp.get("destination-port-range") or {}
    if pr.get("min")==22 and pr.get("max")==22:
        ok=True
        break
print("bastion_to_core_ssh_rule=%s" % str(ok).lower())
if not ok:
    raise SystemExit(5)
PY

CORE_ID="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name teswa-core-01   --lifecycle-state RUNNING   --all   --query 'data[0].id'   --raw-output)"

elapsed=0
while true; do
  PLUGINS="$(oci instance-agent plugin list     --compartment-id "$COMPARTMENT"     --instanceagent-id "$CORE_ID"     --all     --output json)"
  STATUS="$(printf '%s' "$PLUGINS" | python3 -c '
import json,sys
rows=json.load(sys.stdin).get("data",[])
by={x.get("name"):x.get("status") for x in rows}
print(by.get("Bastion","MISSING"))
')"
  if [ "$STATUS" = "RUNNING" ]; then
    echo "bastion_plugin=RUNNING"
    break
  fi
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "bastion_plugin=$STATUS"
    echo "verify=FAIL reason=plugin_timeout"
    exit 6
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

echo
echo "Terraform drift check:"
set +e
"$TF" plan   -var-file="$BASE_VARS"   -var-file="$ADMIN_VARS"   -detailed-exitcode   -no-color   >/tmp/teswa-phase4-bastion-drift.txt
RC=$?
set -e
case "$RC" in
  0) echo "terraform_drift=none" ;;
  2) echo "terraform_drift=changes_detected"; tail -n 80 /tmp/teswa-phase4-bastion-drift.txt; exit 7 ;;
  *) echo "terraform_plan=error"; tail -n 80 /tmp/teswa-phase4-bastion-drift.txt; exit "$RC" ;;
esac

echo "phase4_admin_bastion_verify=PASS"
