#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
TARGET_NAME="teswa-phase6-core-realtime-runtime-shell"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-core-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || {
  echo "phase6_recovery=FAIL reason=core_instance_not_found" >&2
  exit 2
}

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

oci instance-agent command-execution list \
  --compartment-id "$COMPARTMENT" \
  --instance-id "$INSTANCE_ID" \
  --all \
  --output json > "$tmp"

COMMAND_ID="$(python3 - "$tmp" "$TARGET_NAME" <<'PY'
import json,sys
path,target=sys.argv[1:]
items=json.load(open(path,encoding="utf-8")).get("data",[])
matches=[x for x in items if x.get("display-name")==target]
matches.sort(key=lambda x:x.get("time-created", ""), reverse=True)
print(matches[0].get("instance-agent-command-id", "") if matches else "")
PY
)"

if [ -z "$COMMAND_ID" ]; then
  echo "phase6_recovery=NOT_FOUND"
  echo "recent_execution_names:"
  python3 - "$tmp" <<'PY'
import json,sys
items=json.load(open(sys.argv[1],encoding="utf-8")).get("data",[])
items.sort(key=lambda x:x.get("time-created", ""), reverse=True)
for x in items[:12]:
    print("- name=%s state=%s time=%s command_id=%s" % (
        x.get("display-name", ""),
        x.get("lifecycle-state", ""),
        x.get("time-created", ""),
        x.get("instance-agent-command-id", ""),
    ))
PY
  exit 3
fi

echo "phase6_command_id=$COMMAND_ID"

EXEC_JSON="$(oci instance-agent command-execution get \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --output json)"

printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
c=d.get("content") or {}
print("display_name=%s" % d.get("display-name", ""))
print("lifecycle_state=%s" % d.get("lifecycle-state", ""))
print("delivery_state=%s" % d.get("delivery-state", ""))
print("exit_code=%s" % c.get("exit-code"))
msg=c.get("message") or ""
if msg: print("message=%s" % msg)
text=(c.get("text") or "").rstrip()
if text:
    print("--- command_output ---")
    print(text)
    print("--- end_command_output ---")
'
