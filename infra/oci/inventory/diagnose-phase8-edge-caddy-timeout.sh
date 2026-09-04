#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-300}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo "phase8_caddy_timeout_diag=FAIL reason=edge_not_running" >&2; exit 2; }

SCRIPT_TEXT='set -Eeuo pipefail
echo "TESWA PHASE 8 EDGE CADDY TIMEOUT DIAGNOSTIC"
echo "mutation=none"
echo "target=teswa-edge-01"
echo "run_as_user=$(id -un)"
echo "--- package_state ---"
if rpm -q caddy >/dev/null 2>&1; then echo "caddy_rpm_installed=true"; rpm -q caddy; else echo "caddy_rpm_installed=false"; fi
if rpm -q dnf-plugins-core >/dev/null 2>&1; then echo "dnf_plugins_core_installed=true"; else echo "dnf_plugins_core_installed=false"; fi
echo "--- repo_state ---"
repo_files="$(find /etc/yum.repos.d -maxdepth 1 -type f \( -iname "*caddy*" -o -iname "*copr*" \) -print 2>/dev/null || true)"
if [ -n "$repo_files" ]; then echo "caddy_repo_present=true"; printf "%s\n" "$repo_files"; grep -hE "^\[|^baseurl=|^enabled=" $repo_files 2>/dev/null || true; else echo "caddy_repo_present=false"; fi
echo "--- process_state ---"
if pgrep -af "(^|/)(dnf|rpm)( |$)" >/tmp/teswa-phase8-dnf-procs 2>/dev/null; then echo "package_process_running=true"; cat /tmp/teswa-phase8-dnf-procs; else echo "package_process_running=false"; fi
rm -f /tmp/teswa-phase8-dnf-procs
echo "--- service_state ---"
if systemctl list-unit-files caddy.service >/dev/null 2>&1; then echo "caddy_unit_present=true"; else echo "caddy_unit_present=false"; fi
if systemctl is-active --quiet caddy 2>/dev/null; then echo "caddy_service_active=true"; else echo "caddy_service_active=false"; fi
if systemctl is-enabled --quiet caddy 2>/dev/null; then echo "caddy_service_enabled=true"; else echo "caddy_service_enabled=false"; fi
if [ -f /etc/caddy/Caddyfile ]; then echo "caddyfile_present=true"; else echo "caddyfile_present=false"; fi
if [ -f /etc/teswa/phase8-caddy-shell-owned ]; then echo "ownership_marker_present=true"; else echo "ownership_marker_present=false"; fi
echo "--- listeners ---"
ss -ltnH | awk "{print \$4}" | grep -E "(^|:)(80|443|8080)$" || true
echo "--- outbound_probe ---"
if command -v curl >/dev/null 2>&1; then
  if timeout 12 curl -fsSI --connect-timeout 5 https://copr.fedorainfracloud.org/ >/dev/null; then echo "copr_https_reachable=true"; else echo "copr_https_reachable=false"; fi
  if timeout 12 curl -fsSI --connect-timeout 5 https://download.copr.fedorainfracloud.org/results/@caddy/caddy/ >/dev/null; then echo "caddy_repo_https_reachable=true"; else echo "caddy_repo_https_reachable=false"; fi
else
  echo "curl_present=false"
fi
echo "phase8_caddy_timeout_diag=PASS"'

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

COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 180 --display-name "teswa-phase8-edge-caddy-timeout-diagnostic" --query 'data.id' --raw-output)"
elapsed=0; last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID" --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  if [ "$STATE" != "$last_state" ]; then echo "run_command_state=$STATE"; last_state="$STATE"; fi
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print("exit_code=%s"%c.get("exit-code")); print((c.get("text") or "").rstrip()); raise SystemExit(0 if c.get("exit-code") in (0,None) else 5)'
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print("message=%s"%(c.get("message") or "")); print((c.get("text") or "").rstrip())'
    exit 6
  fi
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "phase8_caddy_timeout_diag=FAIL reason=poll_timeout state=$STATE"; exit 7; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done
