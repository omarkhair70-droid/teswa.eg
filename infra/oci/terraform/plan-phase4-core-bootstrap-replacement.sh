#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
BASE_VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"
ADMIN_VARS="${TESWA_PHASE4_BASTION_VARS:-phase4-admin-bastion.local.tfvars}"
CONNECT_VARS="${TESWA_PHASE4_BASTION_CONNECTIVITY_VARS:-phase4-bastion-connectivity.local.tfvars}"
BOOT_VARS="${TESWA_PHASE4_CORE_BOOTSTRAP_VARS:-phase4-core-bootstrap.local.tfvars}"
PLAN="${TESWA_PHASE4_CORE_BOOTSTRAP_PLAN:-teswa-phase4-core-bootstrap-replacement.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
for f in "$BASE_VARS" "$ADMIN_VARS" "$CONNECT_VARS" "$BOOT_VARS"; do
  [ -f "$f" ] || { echo "Missing $f" >&2; exit 2; }
done

echo "TESWA PHASE 4 CORE BOOTSTRAP REPLACEMENT PLAN"
echo "mode=plan-only"
echo "production_cutover=none"
echo "data_migration=none"
echo

"$TF" fmt -check *.tf
"$TF" validate
"$TF" plan   -var-file="$BASE_VARS"   -var-file="$ADMIN_VARS"   -var-file="$CONNECT_VARS"   -var-file="$BOOT_VARS"   -out="$PLAN"

"$TF" show -json "$PLAN" >/tmp/teswa-phase4-core-bootstrap-plan.json

python3 - /tmp/teswa-phase4-core-bootstrap-plan.json <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
changes=[]
for rc in p.get("resource_changes",[]):
    actions=rc.get("change",{}).get("actions",[])
    if actions in (["no-op"],["read"]):
        continue
    changes.append((rc.get("address",""),actions,rc))

print("PHASE4 CORE BOOTSTRAP REPLACEMENT PLAN GUARD")
print("changed_resources=%d" % len(changes))
for addr,actions,_ in changes:
    print("change=%s actions=%s" % (addr,",".join(actions)))

if len(changes)!=1:
    print("phase4_core_bootstrap_plan_guard=FAIL reason=unexpected_change_count")
    raise SystemExit(4)

addr,actions,rc=changes[0]
if addr!="oci_core_instance.core[0]" or set(actions)!={"delete","create"}:
    print("phase4_core_bootstrap_plan_guard=FAIL reason=unexpected_change")
    raise SystemExit(5)

after=rc.get("change",{}).get("after") or {}
md=after.get("metadata") or {}
if not str(md.get("ssh_authorized_keys") or "").strip():
    print("phase4_core_bootstrap_plan_guard=FAIL reason=missing_launch_ssh_key")
    raise SystemExit(6)
if not str(md.get("user_data") or "").strip():
    print("phase4_core_bootstrap_plan_guard=FAIL reason=missing_launch_user_data")
    raise SystemExit(7)

vnics=after.get("create_vnic_details") or []
vnic=vnics[0] if vnics else {}
if not str(vnic.get("private_ip") or "").strip():
    print("phase4_core_bootstrap_plan_guard=FAIL reason=private_ip_not_pinned")
    raise SystemExit(8)

print("replacement_scope=teswa-core-01-only")
print("launch_ssh_key_present=true")
print("launch_user_data_present=true")
print("private_ip_pinned=true")
print("phase4_core_bootstrap_plan_guard=PASS")
PY

echo
echo "Saved plan: $PLAN"
echo "No OCI resources were changed."
