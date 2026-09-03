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

printf '%s' "$DG" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("name")=="teswa-run-command-instances" and x.get("lifecycle-state")!="DELETED"]
if len(rows)!=1:
    print("dynamic_group_count=%d" % len(rows))
    raise SystemExit(3)
x=rows[0]
print("dynamic_group_state=%s" % x.get("lifecycle-state"))
print("dynamic_group_rule_present=%s" % str("instance.compartment.id" in (x.get("matching-rule") or "")).lower())
if x.get("lifecycle-state")!="ACTIVE":
    raise SystemExit(4)
'

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
echo "phase4_iam_verify=PASS"
echo "IAM propagation to instance certificates can still take time after this control-plane check."
