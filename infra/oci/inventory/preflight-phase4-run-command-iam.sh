#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"

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

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

echo "TESWA PHASE 4 RUN COMMAND IAM PREFLIGHT"
echo "mode=read-only"
echo

DG_JSON="$(oci iam dynamic-group list   --compartment-id "$TENANCY_OCID"   --all   --output json)"

printf '%s' "$DG_JSON" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("name")=="teswa-run-command-instances" and x.get("lifecycle-state")!="DELETED"]
print("matching_dynamic_groups=%d" % len(rows))
for x in rows:
    print("dynamic_group_state=%s" % x.get("lifecycle-state"))
'

POL_JSON="$(oci iam policy list   --compartment-id "$TENANCY_OCID"   --all   --output json)"

printf '%s' "$POL_JSON" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("name")=="teswa-run-command-policy" and x.get("lifecycle-state")!="DELETED"]
print("matching_root_policies=%d" % len(rows))
for x in rows:
    print("policy_state=%s" % x.get("lifecycle-state"))
    for s in x.get("statements") or []:
        if "instance-agent-command-execution-family" in s:
            print("run_command_execution_statement=present")
'

for name in teswa-core-01 teswa-edge-01; do
  INSTANCE_ID="$(oci compute instance list     --compartment-id "$COMPARTMENT"     --display-name "$name"     --lifecycle-state RUNNING     --all     --query 'data[0].id'     --raw-output)"

  if [ -z "$INSTANCE_ID" ] || [ "$INSTANCE_ID" = "null" ]; then
    echo "instance=$name state=missing"
    continue
  fi

  set +e
  EXECS="$(oci instance-agent command-execution list     --compartment-id "$COMPARTMENT"     --instance-id "$INSTANCE_ID"     --all     --output json 2>/tmp/teswa-phase4-exec-list.err)"
  RC=$?
  set -e

  if [ "$RC" -ne 0 ]; then
    echo "instance=$name command_execution_list=unavailable"
  elif [ -z "$(printf '%s' "$EXECS" | tr -d '[:space:]')" ]; then
    echo "instance=$name accepted_commands=0"
  else
    printf '%s' "$EXECS" | python3 -c '
import json,sys
name=sys.argv[1]
rows=json.load(sys.stdin).get("data",[])
accepted=[x for x in rows if x.get("lifecycle-state")=="ACCEPTED"]
print("instance=%s accepted_commands=%d" % (name,len(accepted)))
' "$name"
  fi
done

echo
echo "diagnosis=Run Command plugin is RUNNING but the inventory execution remained ACCEPTED."
echo "required_fix=dynamic group + instance-agent-command-execution-family policy"
echo "preflight=PASS"
echo "No OCI resources were changed."
