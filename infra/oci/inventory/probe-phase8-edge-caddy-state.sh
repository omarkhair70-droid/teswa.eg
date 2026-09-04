#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-90}"

[ -x "$TF" ] || { echo "phase8_edge_caddy_probe=FAIL reason=terraform_missing" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "phase8_edge_caddy_probe=FAIL reason=oci_cli_missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "phase8_edge_caddy_probe=FAIL reason=python_missing" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
EDGE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-edge-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"

[ -n "$EDGE_ID" ] && [ "$EDGE_ID" != "null" ] && [ "$EDGE_ID" != "None" ] || {
  echo "phase8_edge_caddy_probe=FAIL reason=edge_not_running" >&2
  exit 2
}

SCRIPT_TEXT='set -Eeuo pipefail
printf "run_as_user=%s\n" "$(id -un)"
printf "uid=%s\n" "$(id -u)"
if sudo -n true 2>/dev/null; then echo "passwordless_sudo=true"; else echo "passwordless_sudo=false"; fi
if command -v caddy >/dev/null 2>&1; then
  echo "caddy_present=true"
  printf "caddy_path=%s\n" "$(command -v caddy)"
  printf "caddy_version=%s\n" "$(caddy version 2>/dev/null | head -n1 || true)"
else
  echo "caddy_present=false"
fi
if systemctl is-active --quiet caddy.service 2>/dev/null; then echo "caddy_service_active=true"; else echo "caddy_service_active=false"; fi
if systemctl is-enabled --quiet caddy.service 2>/dev/null; then echo "caddy_service_enabled=true"; else echo "caddy_service_enabled=false"; fi
if [ -f /etc/caddy/Caddyfile ]; then
  echo "caddyfile_present=true"
  sed -n "1,80p" /etc/caddy/Caddyfile | sed "s/^/caddyfile: /"
else
  echo "caddyfile_present=false"
fi
if ss -ltnH | awk "$4 == \"127.0.0.1:8080\" {found=1} END {exit found ? 0 : 1}"; then echo "listener_127_0_0_1_8080=true"; else echo "listener_127_0_0_1_8080=false"; fi
if ss -ltnH | awk "$4 ~ /(^|:)80$/ {found=1} END {exit found ? 0 : 1}"; then echo "listener_80=true"; else echo "listener_80=false"; fi
if ss -ltnH | awk "$4 ~ /(^|:)443$/ {found=1} END {exit found ? 0 : 1}"; then echo "listener_443=true"; else echo "listener_443=false"; fi
health="$(curl --silent --show-error --max-time 5 http://127.0.0.1:8080/healthz 2>/dev/null || true)"
printf "health_body=%s\n" "$health"
if [ "$health" = "teswa-edge-caddy-ok" ]; then echo "health_ok=true"; else echo "health_ok=false"; fi
if command -v cloud-init >/dev/null 2>&1; then
  printf "cloud_init_status=%s\n" "$(cloud-init status 2>/dev/null | tr "\n" " " || true)"
fi
if [ -f /var/log/cloud-init-output.log ]; then
  echo "--- cloud_init_output_tail ---"
  tail -n 60 /var/log/cloud-init-output.log | tr -cd "\11\12\15\40-\176"
  echo "--- end_cloud_init_output_tail ---"
fi
'

content_file="$(mktemp)"
target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT

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

echo "TESWA PHASE 8 EDGE CADDY STATE PROBE"
echo "target=teswa-edge-01"
echo "mutation=none"
echo "terraform_change=none"
echo "package_install=none"
echo "service_restart=none"
echo "network_change=none"

COMMAND_ID="$(oci instance-agent command create \
  --compartment-id "$COMPARTMENT" \
  --content "file://$content_file" \
  --target "file://$target_file" \
  --timeout-in-seconds 60 \
  --display-name teswa-phase8-edge-caddy-state-probe \
  --query 'data.id' \
  --raw-output)"

echo "command_id=$COMMAND_ID"
elapsed=0
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$EDGE_ID" --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  DELIVERY="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("delivery-state",""))')"
  echo "probe_state=$STATE delivery=$DELIVERY elapsed_seconds=$elapsed"

  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}
print("exit_code=%s" % c.get("exit-code"))
print((c.get("text") or "").rstrip())
if c.get("exit-code") not in (0,None): raise SystemExit(20)
'
    echo "phase8_edge_caddy_probe=PASS"
    exit 0
  fi

  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print((c.get("text") or c.get("message") or "").rstrip())'
    echo "phase8_edge_caddy_probe=FAIL reason=guest_probe_$STATE"
    exit 3
  fi

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "phase8_edge_caddy_probe=FAIL reason=no_ack_within_window state=$STATE delivery=$DELIVERY"
    exit 4
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
