#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo "teswa-core-01 is not RUNNING." >&2; exit 2; }

SCRIPT_TEXT='set -Eeuo pipefail
echo "TESWA PHASE 5 API SHELL DIAGNOSTIC"
echo "mutation=none"
echo "target=teswa-core-01"
echo "run_as_user=$(id -un)"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif sudo -n true >/dev/null 2>&1; then SUDO="sudo"; else echo "diagnostic=FAIL reason=no_privileged_execution"; exit 10; fi
echo "[systemd]"
$SUDO systemctl is-enabled teswa-api 2>&1 || true
$SUDO systemctl is-active teswa-api 2>&1 || true
$SUDO systemctl status teswa-api --no-pager -l 2>&1 | tail -n 40 || true
echo "[journal]"
$SUDO journalctl -u teswa-api -n 80 --no-pager 2>&1 || true
echo "[container_list]"
$SUDO podman ps -a --filter name=teswa-api --format "name={{.Names}} status={{.Status}} image={{.Image}}" 2>&1 || true
echo "[container_inspect]"
$SUDO podman inspect teswa-api --format "running={{.State.Running}} status={{.State.Status}} exit_code={{.State.ExitCode}} error={{.State.Error}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}" 2>&1 || true
echo "[container_logs]"
$SUDO podman logs --tail 80 teswa-api 2>&1 || true
echo "[listeners]"
ss -ltnp 2>&1 | grep -E ":3100([[:space:]]|$)" || true
echo "[unit]"
$SUDO systemctl cat teswa-api 2>&1 || true
echo "diagnostic=PASS"'

guest_script_bytes="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 5 API SHELL DIAGNOSTIC RUNNER"
echo "guest_mutation=none"
echo "guest_script_bytes=$guest_script_bytes"
[ "$guest_script_bytes" -le 4096 ] || { echo "diagnostic=FAIL reason=run_command_plaintext_limit" >&2; exit 3; }

content_file="$(mktemp)"; target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT
python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
p,t=sys.argv[1:]
with open(p,"w",encoding="utf-8") as f: json.dump({"source":{"sourceType":"TEXT","text":t},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$INSTANCE_ID" <<'PY'
import json,sys
p,i=sys.argv[1:]
with open(p,"w",encoding="utf-8") as f: json.dump({"instanceId":i},f)
PY
COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 300 --display-name "teswa-phase5-api-shell-diagnostic" --query 'data.id' --raw-output)"
elapsed=0; last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  if [ "$STATE" != "$last_state" ]; then echo "run_command_state=$STATE"; last_state="$STATE"; fi
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; c=json.load(sys.stdin).get("data",{}).get("content") or {}; print("exit_code=%s"%c.get("exit-code")); print((c.get("text") or "").rstrip())'
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; c=json.load(sys.stdin).get("data",{}).get("content") or {}; print("message=%s"%(c.get("message") or "")); print((c.get("text") or "").rstrip())'
    exit 4
  fi
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "diagnostic=FAIL reason=poll_timeout state=$STATE"; exit 5; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done
