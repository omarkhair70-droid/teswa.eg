#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
PLAN="${TESWA_LANE3_FINAL_PLAN:-/tmp/teswa-lane3-final-drift.plan}"

[ -x "$TF" ] || { echo "lane3_final_drift=FAIL reason=terraform_missing"; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "lane3_final_drift=FAIL reason=oci_cli_missing"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "lane3_final_drift=FAIL reason=python_missing"; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
cd "$ROOT"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
TENANCY="$(oci iam compartment get --compartment-id "$COMPARTMENT" --query 'data."compartment-id"' --raw-output)"
CORE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
CORE_IP="$(oci compute instance list-vnics --instance-id "$CORE_ID" --query 'data[0]."private-ip"' --raw-output)"
EDGE_IP="$(oci compute instance list-vnics --instance-id "$EDGE_ID" --query 'data[0]."private-ip"' --raw-output)"

for p in "tenancy:$TENANCY" "core_id:$CORE_ID" "edge_id:$EDGE_ID" "core_ip:$CORE_IP" "edge_ip:$EDGE_IP"; do
  k="${p%%:*}"; v="${p#*:}"
  [ -n "$v" ] && [ "$v" != null ] && [ "$v" != None ] || { echo "lane3_final_drift=FAIL reason=missing_runtime_value target=$k"; exit 2; }
done

STATE="$(mktemp)"
trap 'rm -f "$STATE"' EXIT
"$TF" state pull > "$STATE"

eval "$(python3 - "$STATE" <<'PY'
import json,shlex,sys
p=json.load(open(sys.argv[1],encoding='utf-8'))

def inst(name):
    for r in p.get('resources',[]):
        if r.get('type')=='oci_core_instance' and r.get('name')==name:
            for i in r.get('instances',[]):
                return i.get('attributes') or {}
    raise SystemExit('missing instance '+name)

def source(a):
    s=a.get('source_details') or []
    return (s[0] if s else {}).get('source_id','')

c=inst('core'); e=inst('edge'); meta=c.get('metadata') or {}
key=(meta.get('ssh_authorized_keys') or '').strip()
print('CORE_IMAGE='+shlex.quote(source(c)))
print('EDGE_IMAGE='+shlex.quote(source(e)))
print('CORE_BOOTSTRAP='+('true' if key else 'false'))
print('CORE_SSH_KEY='+shlex.quote(key))
PY
)"

[ -n "$CORE_IMAGE" ] || { echo "lane3_final_drift=FAIL reason=core_image_missing_from_state"; exit 3; }
[ -n "$EDGE_IMAGE" ] || { echo "lane3_final_drift=FAIL reason=edge_image_missing_from_state"; exit 3; }

STATE_LIST="$("$TF" state list)"
DG_ADDR='oci_identity_dynamic_group.teswa_core_lane4_rehearsal_readonly[0]'
POL_ADDR='oci_identity_policy.teswa_core_lane4_rehearsal_readonly[0]'
DG_PRESENT=false
POL_PRESENT=false
grep -Fxq "$DG_ADDR" <<<"$STATE_LIST" && DG_PRESENT=true
grep -Fxq "$POL_ADDR" <<<"$STATE_LIST" && POL_PRESENT=true
if [ "$DG_PRESENT" != "$POL_PRESENT" ]; then
  echo "lane3_final_drift=FAIL reason=lane4_iam_partial_state dynamic_group=$DG_PRESENT policy=$POL_PRESENT"
  exit 4
fi
LANE4="$DG_PRESENT"

echo "TESWA LANE 3 FINAL DRIFT ONLY"
echo "core_private_ip=$CORE_IP"
echo "edge_private_ip=$EDGE_IP"
echo "lane4_iam_present=$LANE4"
echo "production_cutover=none"
echo "dns_change=none"
echo "mutation=none"

"$TF" fmt -check *.tf
"$TF" validate

FINAL=(
  -var="tenancy_ocid=$TENANCY"
  -var="enable_object_storage=true"
  -var="enable_vault=true"
  -var="enable_notifications=true"
  -var="enable_compute_phase3=true"
  -var="core_image_ocid=$CORE_IMAGE"
  -var="edge_image_ocid=$EDGE_IMAGE"
  -var="enable_run_command_iam=true"
  -var="enable_lane3_backup_iam=true"
  -var="enable_admin_bastion=false"
  -var="enable_admin_bastion_connectivity=false"
  -var="enable_phase8b_internal_proxy=true"
  -var="phase8b_core_private_ip=$CORE_IP"
  -var="phase8b_edge_private_ip=$EDGE_IP"
)

if [ "$CORE_BOOTSTRAP" = true ]; then
  FINAL+=(
    -var="enable_core_bootstrap_metadata=true"
    -var="core_bootstrap_private_ip=$CORE_IP"
    -var="core_bootstrap_ssh_public_key=$CORE_SSH_KEY"
  )
fi

if [ "$LANE4" = true ]; then
  FINAL+=(
    -var="enable_lane4_rehearsal_readonly_iam=true"
    -var="lane4_rehearsal_core_instance_ocid=$CORE_ID"
  )
fi

rm -f "$PLAN"
set +e
"$TF" plan -detailed-exitcode -no-color "${FINAL[@]}" -out="$PLAN"
RC=$?
set -e

echo "terraform_drift_exit=$RC"
if [ "$RC" -eq 0 ]; then
  echo "lane4_iam_preserved=$LANE4"
  echo "lane3_final_drift=PASS"
  echo "lane3_closeout=PASS"
  exit 0
fi

if [ "$RC" -eq 2 ]; then
  echo "lane3_final_drift=FAIL reason=nonzero_changes"
  "$TF" show -no-color "$PLAN"
  exit 20
fi

echo "lane3_final_drift=FAIL reason=terraform_error rc=$RC"
exit "$RC"
