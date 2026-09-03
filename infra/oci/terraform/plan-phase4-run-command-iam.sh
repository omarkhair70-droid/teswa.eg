#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"
PLAN="${TESWA_PHASE4_IAM_PLAN:-teswa-phase4-run-command-iam.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
[ -f "$VARS" ] || { echo "Missing $VARS. Phase 3 compute vars are required to preserve existing resources." >&2; exit 2; }

echo "TESWA PHASE 4 RUN COMMAND IAM PLAN"
echo "mode=plan-only"
echo

"$TF" fmt -check *.tf
"$TF" validate
"$TF" plan   -var-file="$VARS"   -var='enable_run_command_iam=true'   -out="$PLAN"

"$TF" show -json "$PLAN" >/tmp/teswa-phase4-run-command-iam-plan.json

python3 - /tmp/teswa-phase4-run-command-iam-plan.json <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
expected={
  "oci_identity_dynamic_group.teswa_run_command[0]",
  "oci_identity_policy.teswa_run_command[0]",
}
adds=set()
bad=[]
destroys=[]
for rc in p.get("resource_changes",[]):
    addr=rc.get("address","")
    actions=rc.get("change",{}).get("actions",[])
    if actions in (["no-op"],["read"]):
        continue
    if actions==["create"]:
        adds.add(addr)
    else:
        bad.append((addr,actions))
    if "delete" in actions:
        destroys.append(addr)

print("PHASE4 RUN COMMAND IAM PLAN GUARD")
print("adds=%d" % len(adds))
print("destroys=%d" % len(destroys))
for x in sorted(adds):
    print("add="+x)

if adds!=expected or bad or destroys:
    print("phase4_iam_plan_guard=FAIL")
    print("unexpected_or_missing_adds=%s" % sorted(adds ^ expected))
    if bad: print("bad_actions=%s" % bad)
    if destroys: print("destroys=%s" % destroys)
    raise SystemExit(3)

print("phase4_iam_plan_guard=PASS")
PY

echo
echo "Saved plan: $PLAN"
echo "No OCI resources were changed."
echo "Do not apply until this saved IAM plan is reviewed."
