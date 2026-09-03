#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-10}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1200}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

if [ "${TESWA_ALLOW_EDGE_REBOOT:-}" != "YES" ]; then
  echo "Refusing mutation: set TESWA_ALLOW_EDGE_REBOOT=YES to reboot only teswa-edge-01." >&2
  exit 2
fi

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

INSTANCE_JSON="$(oci compute instance list   --compartment-id "$COMPARTMENT"   --display-name "teswa-edge-01"   --all   --output json)"

INSTANCE_ID="$(printf '%s' "$INSTANCE_JSON" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")]
if len(rows)!=1:
    raise SystemExit("expected exactly one active teswa-edge-01")
print(rows[0]["id"])
')"

STATE="$(printf '%s' "$INSTANCE_JSON" | python3 -c '
import json,sys
rows=[x for x in json.load(sys.stdin).get("data",[]) if x.get("lifecycle-state") not in ("TERMINATED","TERMINATING")]
print(rows[0].get("lifecycle-state","UNKNOWN"))
')"

echo "TESWA PHASE 4 EDGE RUN COMMAND RECOVERY"
echo "target=teswa-edge-01"
echo "current_state=$STATE"
echo "action=SOFTRESET"
echo "production_cutover=none"
echo "supabase_change=none"
echo "nova_change=none"
echo

oci compute instance action   --instance-id "$INSTANCE_ID"   --action SOFTRESET   >/dev/null

echo "softreset_requested=true"

elapsed=0
last=""
while true; do
  state="$(oci compute instance get     --instance-id "$INSTANCE_ID"     --query 'data."lifecycle-state"'     --raw-output)"

  if [ "$state" != "$last" ]; then
    echo "instance_state=$state"
    last="$state"
  fi

  if [ "$state" = "RUNNING" ]; then
    break
  fi

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "recovery=FAIL reason=instance_state_timeout"
    exit 3
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

echo
echo "Waiting for Compute Instance Run Command plugin..."

elapsed=0
while true; do
  set +e
  PLUGINS="$(oci instance-agent plugin list     --compartment-id "$COMPARTMENT"     --instanceagent-id "$INSTANCE_ID"     --all     --output json 2>/tmp/teswa-phase4-recovery-plugin.err)"
  RC=$?
  set -e

  if [ "$RC" -eq 0 ] && [ -n "$(printf '%s' "$PLUGINS" | tr -d '[:space:]')" ]; then
    RESULT="$(printf '%s' "$PLUGINS" | python3 -c '
import json,sys
rows=json.load(sys.stdin).get("data",[])
by={x.get("name"):x.get("status") for x in rows}
run=by.get("Compute Instance Run Command","MISSING")
mon=by.get("Compute Instance Monitoring","MISSING")
print("run_command_plugin=%s" % run)
print("monitoring_plugin=%s" % mon)
print("ready=true" if run=="RUNNING" and mon=="RUNNING" else "ready=false")
')"

    if printf '%s
' "$RESULT" | grep -q '^ready=true$'; then
      printf '%s
' "$RESULT"
      echo "recovery=PASS"
      echo "Retry the read-only OS inventory with a fresh command."
      exit 0
    fi
  fi

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "recovery=FAIL reason=plugin_timeout"
    if [ -s /tmp/teswa-phase4-recovery-plugin.err ]; then
      tail -n 20 /tmp/teswa-phase4-recovery-plugin.err
    fi
    exit 4
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
