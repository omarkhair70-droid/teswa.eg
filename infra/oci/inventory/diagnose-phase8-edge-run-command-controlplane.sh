#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-edge-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo "phase8_controlplane=FAIL reason=edge_instance_not_found" >&2
  exit 2
}

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

oci instance-agent command-execution list \
  --compartment-id "$COMPARTMENT" \
  --instance-id "$INSTANCE_ID" \
  --all \
  --output json > "$TMP"

echo "TESWA PHASE 8 EDGE RUN COMMAND CONTROL-PLANE DIAGNOSTIC"
echo "guest_mutation=none"
echo "guest_command_created=false"
echo "target=teswa-edge-01"

python3 - "$TMP" <<'PY'
import json,sys
items=json.load(open(sys.argv[1],encoding="utf-8")).get("data",[])
items.sort(key=lambda x:x.get("time-created", ""), reverse=True)
active={"ACCEPTED","IN_PROGRESS"}
recent=items[:12]
print("recent_execution_count=%d" % len(recent))
print("active_execution_count=%d" % sum(1 for x in items if x.get("lifecycle-state") in active))
for i,x in enumerate(recent,1):
    print("execution_%02d_name=%s" % (i,x.get("display-name", "")))
    print("execution_%02d_state=%s" % (i,x.get("lifecycle-state", "")))
    print("execution_%02d_delivery=%s" % (i,x.get("delivery-state", "")))
    print("execution_%02d_time=%s" % (i,x.get("time-created", "")))
    print("execution_%02d_command_id=%s" % (i,x.get("instance-agent-command-id", "")))
print("phase8_controlplane_diagnostic=PASS")
PY
