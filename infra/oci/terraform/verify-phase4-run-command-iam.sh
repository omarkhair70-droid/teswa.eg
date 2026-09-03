#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
[ -n "$TENANCY_OCID" ] || { echo "Could not discover tenancy OCID." >&2; exit 2; }

echo "TESWA PHASE 4 RUN COMMAND IAM VERIFY"

DG="$(oci iam dynamic-group list   --compartment-id "$TENANCY_OCID"   --all   --output json)"

DG_ID="$(printf '%s' "$DG" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("name")=="teswa-run-command-instances" and x.get("lifecycle-state")!="DELETED"]
if len(rows)!=1:
    print("")
else:
    print(rows[0].get("id",""))
')"

[ -n "$DG_ID" ] || { echo "dynamic_group_count_check=FAIL"; exit 3; }

DG_GET="$(oci iam dynamic-group get   --dynamic-group-id "$DG_ID"   --output json)"

TESWA_COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

printf '%s' "$DG_GET" | python3 -c '
import json,sys
expected_compartment=sys.argv[1]
x=json.load(sys.stdin).get("data",{})
state=x.get("lifecycle-state")
rule=x.get("matching-rule") or x.get("matching_rule") or ""
has_field="instance.compartment.id" in rule
has_compartment=expected_compartment in rule
print("dynamic_group_state=%s" % state)
print("dynamic_group_rule_field_present=%s" % str(has_field).lower())
print("dynamic_group_rule_compartment_match=%s" % str(has_compartment).lower())
if state!="ACTIVE":
    raise SystemExit(4)
if not has_field or not has_compartment:
    raise SystemExit(8)
' "$TESWA_COMPARTMENT"

POL="$(oci iam policy list   --compartment-id "$TENANCY_OCID"   --all   --output json)"

printf '%s' "$POL" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("name")=="teswa-run-command-policy" and x.get("lifecycle-state")!="DELETED"]
if len(rows)!=1:
    print("policy_count=%d" % len(rows))
    raise SystemExit(5)
x=rows[0]
statements=x.get("statements") or []
expected="instance-agent-command-execution-family"
same_instance="request.instance.id=target.instance.id"
print("policy_state=%s" % x.get("lifecycle-state"))
print("execution_family_statement=%s" % str(any(expected in s for s in statements)).lower())
print("same_instance_condition=%s" % str(any(same_instance in s for s in statements)).lower())
if x.get("lifecycle-state")!="ACTIVE":
    raise SystemExit(6)
if not any(expected in s and same_instance in s for s in statements):
    raise SystemExit(7)
'

echo
echo "Terraform drift check:"
set +e
"$TF" plan   -var-file="phase3-compute.local.tfvars"   -detailed-exitcode   -no-color   >/tmp/teswa-phase4-iam-drift.txt
DRIFT_RC=$?
set -e

case "$DRIFT_RC" in
  0) echo "terraform_drift=none" ;;
  2)
    echo "terraform_drift=changes_detected"
    tail -n 80 /tmp/teswa-phase4-iam-drift.txt
    exit 9
    ;;
  *)
    echo "terraform_plan=error"
    tail -n 80 /tmp/teswa-phase4-iam-drift.txt
    exit "$DRIFT_RC"
    ;;
esac

echo
echo "phase4_iam_verify=PASS"
echo "IAM propagation to instance certificates can still take time after this control-plane check."
