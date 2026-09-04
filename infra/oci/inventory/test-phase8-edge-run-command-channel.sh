#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-90}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$EDGE_ID" ] && [ "$EDGE_ID" != "null" ] || { echo "phase8_channel_probe=FAIL reason=edge_not_running" >&2; exit 2; }

AGENT_JSON="$(oci compute instance get --instance-id "$EDGE_ID" --query 'data."agent-config"' --output json)"
printf '%s' "$AGENT_JSON" | python3 -c '
import json,sys
r=json.load(sys.stdin)
plugins=r.get("plugins-config") or []
run=[p for p in plugins if p.get("name")=="Compute Instance Run Command"]
state=(run[0].get("desired-state") if run else "DEFAULT")
print("run_command_desired_state=%s"%state)
print("management_disabled=%s"%str(bool(r.get("is-management-disabled",False))).lower())
print("all_plugins_disabled=%s"%str(bool(r.get("are-all-plugins-disabled",False))).lower())
if state == "DISABLED" or r.get("is-management-disabled") or r.get("are-all-plugins-disabled"):
    raise SystemExit(8)
'

SCRIPT_TEXT='set -Eeuo pipefail
echo "phase8_channel_guest=PASS"
echo "run_as_user=$(id -un)"'
content_file="$(mktemp)"; target_file="$(mktemp)"; trap 'rm -f "$content_file" "$target_file"' EXIT
python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"source":{"sourceType":"TEXT","text":text},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$EDGE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 60 --display-name "teswa-phase8-edge-channel-probe" --query 'data.id' --raw-output)"
echo "command_id=$COMMAND_ID"
elapsed=0; last_state=""; last_delivery=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$EDGE_ID" --output json)"
  read -r STATE DELIVERY EXIT_CODE TEXT < <(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys,shlex; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; vals=[d.get("lifecycle-state","") or "",d.get("delivery-state","") or "",str(c.get("exit-code") if c.get("exit-code") is not None else ""),(c.get("text") or "").replace("\n","\\n")]; print(" ".join(shlex.quote(v) for v in vals))')
  if [ "$STATE" != "$last_state" ] || [ "$DELIVERY" != "$last_delivery" ]; then
    echo "lifecycle_state=$STATE"
    echo "delivery_state=$DELIVERY"
    last_state="$STATE"; last_delivery="$DELIVERY"
  fi
  if [ "$STATE" = "SUCCEEDED" ]; then
    echo "exit_code=$EXIT_CODE"
    printf '%b\n' "${TEXT//\\n/\n}"
    [ "$EXIT_CODE" = "0" ] || { echo "phase8_channel_probe=FAIL reason=nonzero_exit"; exit 4; }
    echo "phase8_channel_probe=PASS"
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    echo "exit_code=$EXIT_CODE"
    printf '%b\n' "${TEXT//\\n/\n}"
    echo "phase8_channel_probe=FAIL reason=terminal_state state=$STATE"
    exit 5
  fi
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "phase8_channel_probe=FAIL reason=no_ack_within_window state=$STATE delivery=$DELIVERY"
    exit 6
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
