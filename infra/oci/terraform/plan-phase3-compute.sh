#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
VARS="${TESWA_PHASE3_VARS:-phase3-compute.local.tfvars}"
PLAN="${TESWA_PHASE3_PLAN:-teswa-phase3-compute.plan}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
[ -f "$VARS" ] || { echo "Missing $VARS. Run the Phase 3 preflight first." >&2; exit 2; }

echo "TESWA OCI PHASE 3 COMPUTE PLAN"
echo "mode=plan-only"
echo

"$TF" fmt -check *.tf
"$TF" validate
"$TF" plan -var-file="$VARS" -out="$PLAN"
"$TF" show -json "$PLAN" >/tmp/teswa-phase3-plan.json

python3 - /tmp/teswa-phase3-plan.json <<'PY'
import json,sys
p=json.load(open(sys.argv[1],encoding="utf-8"))
changes=p.get("resource_changes",[])

expected_adds={
  "oci_core_nat_gateway.app_egress[0]",
  "oci_core_route_table.private_app[0]",
  "oci_core_network_security_group_security_rule.edge_egress[0]",
  "oci_core_network_security_group_security_rule.app_egress[0]",
  "oci_core_instance.edge[0]",
  "oci_core_instance.core[0]",
}
expected_updates={"oci_core_subnet.private_app"}

adds=set()
updates=set()
bad=[]
destroys=[]

for rc in changes:
    addr=rc.get("address","")
    actions=rc.get("change",{}).get("actions",[])
    if actions in (["no-op"], ["read"]):
        continue
    if actions==["create"]:
        adds.add(addr)
    elif actions==["update"]:
        updates.add(addr)
    else:
        bad.append((addr,actions))
    if "delete" in actions:
        destroys.append(addr)

print("PHASE3 PLAN GUARD")
print("adds=%d" % len(adds))
print("updates=%d" % len(updates))
print("destroys=%d" % len(destroys))
for x in sorted(adds): print("add="+x)
for x in sorted(updates): print("update="+x)

if adds != expected_adds or updates != expected_updates or bad or destroys:
    print("phase3_plan_guard=FAIL")
    print("unexpected_or_missing_adds=%s" % sorted(adds ^ expected_adds))
    print("unexpected_or_missing_updates=%s" % sorted(updates ^ expected_updates))
    if bad: print("bad_actions=%s" % bad)
    if destroys: print("destroys=%s" % destroys)
    raise SystemExit(3)

print("phase3_plan_guard=PASS")
PY

echo
echo "Saved plan: $PLAN"
echo "No OCI resources were changed."
echo "Do not apply until the saved plan is reviewed."
