#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo "edge_caddy_preflight=FAIL reason=edge_not_running"; exit 2; }

SCRIPT_TEXT='set -Eeuo pipefail
echo "TESWA PHASE 8 EDGE CADDY PREFLIGHT"
echo "mutation=none"
echo "target=teswa-edge-01"
echo "run_as_user=$(id -un)"
echo "uid=$(id -u)"
if sudo -n true 2>/dev/null; then echo "passwordless_sudo=true"; else echo "passwordless_sudo=false"; fi
if command -v caddy >/dev/null 2>&1; then echo "caddy_present=true"; caddy version || true; else echo "caddy_present=false"; fi
if rpm -q caddy >/dev/null 2>&1; then echo "caddy_rpm_present=true"; else echo "caddy_rpm_present=false"; fi
if systemctl is-active --quiet firewalld; then echo "firewalld_active=true"; else echo "firewalld_active=false"; fi
for p in 80 443 8080; do
  if ss -ltnH | grep -Eq "[[:space:]].*:${p}[[:space:]]"; then echo "listener_${p}=true"; else echo "listener_${p}=false"; fi
done
if command -v dnf >/dev/null 2>&1; then echo "dnf_present=true"; else echo "dnf_present=false"; fi
. /etc/os-release
echo "os_id=$ID"
echo "os_version=$VERSION_ID"
echo "edge_caddy_preflight=PASS"'

guest_script_bytes="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 8 EDGE CADDY PREFLIGHT RUNNER"
echo "guest_mutation=none"
echo "guest_script_bytes=$guest_script_bytes"
[ "$guest_script_bytes" -le 4096 ] || { echo "edge_caddy_preflight=FAIL reason=run_command_plaintext_limit"; exit 3; }

content_file="$(mktemp)"; target_file="$(mktemp)"; trap 'rm -f "$content_file" "$target_file"' EXIT
python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f: json.dump({"source":{"sourceType":"TEXT","text":text},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$INSTANCE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f: json.dump({"instanceId":instance_id},f)
PY
COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 300 --display-name "teswa-phase8-edge-caddy-preflight" --query 'data.id' --raw-output)"
elapsed=0; last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  if [ "$STATE" != "$last_state" ]; then echo "run_command_state=$STATE"; last_state="$STATE"; fi
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print("exit_code=%s"%c.get("exit-code")); print((c.get("text") or "").rstrip()); raise SystemExit(0 if c.get("exit-code") in (0,None) else 4)'
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print("message=%s"%(c.get("message") or "")); print((c.get("text") or "").rstrip())'
    exit 5
  fi
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "edge_caddy_preflight=FAIL reason=poll_timeout state=$STATE"; exit 6; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done
