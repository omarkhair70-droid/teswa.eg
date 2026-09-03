#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
BASE_VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"
ADMIN_VARS="${TESWA_PHASE4_BASTION_VARS:-phase4-admin-bastion.local.tfvars}"
CONNECT_VARS="${TESWA_PHASE4_BASTION_CONNECTIVITY_VARS:-phase4-bastion-connectivity.local.tfvars}"
PLAN="${TESWA_PHASE4_BASTION_CONNECTIVITY_PLAN:-teswa-phase4-bastion-connectivity.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
for f in "$BASE_VARS" "$ADMIN_VARS" "$CONNECT_VARS"; do
  [ -f "$f" ] || { echo "Missing $f" >&2; exit 2; }
done

echo "TESWA PHASE 4 BASTION CONNECTIVITY PLAN"
echo "mode=plan-only"
echo

"$TF" fmt -check *.tf
"$TF" validate
"$TF" plan   -var-file="$BASE_VARS"   -var-file="$ADMIN_VARS"   -var-file="$CONNECT_VARS"   -out="$PLAN"

"$TF" show -json "$PLAN" >/tmp/teswa-phase4-bastion-connectivity-plan.json

python3 - /tmp/teswa-phase4-bastion-connectivity-plan.json <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
expected_adds={"oci_core_security_list.admin_bastion_egress[0]"}
expected_updates={"oci_core_subnet.private_app"}
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

print("PHASE4 BASTION CONNECTIVITY PLAN GUARD")
print("adds=%d" % len(adds))
print("updates=%d" % len(updates))
print("destroys=%d" % len(destroys))
for x in sorted(adds): print("add="+x)
for x in sorted(updates): print("update="+x)

if adds!=expected_adds or updates!=expected_updates or destroys or bad:
    print("phase4_bastion_connectivity_plan_guard=FAIL")
    print("unexpected_or_missing_adds=%s" % sorted(adds ^ expected_adds))
    print("unexpected_or_missing_updates=%s" % sorted(updates ^ expected_updates))
    if destroys: print("destroys=%s" % destroys)
    if bad: print("bad_actions=%s" % bad)
    raise SystemExit(4)

print("phase4_bastion_connectivity_plan_guard=PASS")
PY

echo
echo "Saved plan: $PLAN"
echo "No OCI resources were changed."
