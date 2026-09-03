#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
BASE_VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"
ADMIN_VARS="${TESWA_PHASE4_BASTION_VARS:-phase4-admin-bastion.local.tfvars}"
PLAN="${TESWA_PHASE4_BASTION_PLAN:-teswa-phase4-admin-bastion.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
[ -f "$BASE_VARS" ] || { echo "Missing $BASE_VARS" >&2; exit 2; }
[ -f "$ADMIN_VARS" ] || { echo "Missing $ADMIN_VARS. Run prepare-phase4-admin-bastion.sh first." >&2; exit 3; }

echo "TESWA PHASE 4 TEMP ADMIN BASTION PLAN"
echo "mode=plan-only"
echo

"$TF" fmt -check *.tf
"$TF" validate
"$TF" plan -var-file="$BASE_VARS" -var-file="$ADMIN_VARS" -out="$PLAN"
"$TF" show -json "$PLAN" >/tmp/teswa-phase4-admin-bastion-plan.json

python3 - /tmp/teswa-phase4-admin-bastion-plan.json <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
expected_adds={
  "oci_bastion_bastion.admin[0]",
  "oci_core_network_security_group_security_rule.bastion_to_core_ssh[0]",
}
expected_updates={"oci_core_instance.core[0]"}
adds=set(); updates=set(); destroys=[]; bad=[]
for rc in p.get("resource_changes",[]):
    addr=rc.get("address","")
    actions=rc.get("change",{}).get("actions",[])
    if actions in (["no-op"],["read"]):
        continue
    if actions==["create"]:
        adds.add(addr)
    elif actions==["update"]:
        updates.add(addr)
    else:
        bad.append((addr,actions))
    if "delete" in actions:
        destroys.append(addr)

print("PHASE4 TEMP BASTION PLAN GUARD")
print("adds=%d" % len(adds))
print("updates=%d" % len(updates))
print("destroys=%d" % len(destroys))
for x in sorted(adds): print("add="+x)
for x in sorted(updates): print("update="+x)

if adds!=expected_adds or updates!=expected_updates or destroys or bad:
    print("phase4_bastion_plan_guard=FAIL")
    print("unexpected_or_missing_adds=%s" % sorted(adds ^ expected_adds))
    print("unexpected_or_missing_updates=%s" % sorted(updates ^ expected_updates))
    if destroys: print("destroys=%s" % destroys)
    if bad: print("bad_actions=%s" % bad)
    raise SystemExit(4)

print("phase4_bastion_plan_guard=PASS")
PY

echo
echo "Saved plan: $PLAN"
echo "No OCI resources were changed."
