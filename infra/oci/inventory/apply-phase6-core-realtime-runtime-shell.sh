#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1800}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

if [ "${TESWA_ALLOW_CORE_REALTIME_SHELL:-}" != "YES" ]; then
  echo "Refusing guest mutation: set TESWA_ALLOW_CORE_REALTIME_SHELL=YES." >&2
  exit 2
fi

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
  echo "teswa-core-01 is not RUNNING." >&2
  exit 3
}

SCRIPT_TEXT='set -Eeuo pipefail
echo "run_as_user=$(id -un)"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif sudo -n true 2>/dev/null; then SUDO=sudo; else echo "realtime_shell=FAIL reason=no_privilege"; exit 10; fi
echo "TESWA PHASE 6 CORE REALTIME SHELL"
echo "target=teswa-core-01"
echo "mode=health-only"
echo "listen_target=127.0.0.1:3200"
echo "websocket_claim=false"
echo "production_cutover=none"
echo "supabase_change=none"
command -v podman >/dev/null || { echo "realtime_shell=FAIL reason=podman_missing"; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo "realtime_shell=FAIL reason=postgres_inactive"; exit 12; }
systemctl is-active --quiet teswa-api || { echo "realtime_shell=FAIL reason=api_inactive"; exit 13; }
M=/etc/teswa/phase6-realtime-shell-owned
U=/etc/systemd/system/teswa-realtime.service
if $SUDO test -e "$U" && ! $SUDO test -e "$M"; then echo "realtime_shell=FAIL reason=unowned_unit"; exit 14; fi
if $SUDO test -e "$M"; then $SUDO systemctl stop teswa-realtime >/dev/null 2>&1 || true; fi
if ss -ltnH | grep -Eq "[[:space:]].*:3200[[:space:]]"; then echo "realtime_shell=FAIL reason=port_3200_in_use"; exit 15; fi
$SUDO install -d -m 0755 /etc/teswa /opt/teswa/realtime-shell
printf "%s\n" "{\"status\":\"ok\",\"service\":\"teswa-realtime\",\"mode\":\"health-only\",\"websocket\":false,\"productionTraffic\":false}" | $SUDO tee /opt/teswa/realtime-shell/healthz >/dev/null
$SUDO podman pull docker.io/library/python:3.13-alpine >/dev/null
digest="$($SUDO podman image inspect docker.io/library/python:3.13-alpine --format "{{.Digest}}")"
t="$(mktemp)"
cat >"$t" <<EOF
[Unit]
Description=Teswa Realtime runtime shell
After=network-online.target teswa-api.service
Requires=teswa-api.service
[Service]
Restart=always
RestartSec=3
ExecStartPre=-/usr/bin/podman rm -f teswa-realtime
ExecStart=/usr/bin/podman run --pull=never --name teswa-realtime --network host --read-only --cap-drop=all --security-opt=no-new-privileges --pids-limit=64 --memory=64m -v /opt/teswa/realtime-shell:/srv:ro,Z docker.io/library/python:3.13-alpine python -m http.server 3200 --bind 127.0.0.1 --directory /srv
ExecStop=/usr/bin/podman stop -t 10 teswa-realtime
ExecStopPost=-/usr/bin/podman rm -f teswa-realtime
[Install]
WantedBy=multi-user.target
EOF
$SUDO install -m 0644 "$t" "$U"; rm -f "$t"; $SUDO touch "$M"
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now teswa-realtime
body=""
for _ in $(seq 1 20); do body="$(curl -fsS http://127.0.0.1:3200/healthz 2>/dev/null)" && break || true; sleep 1; done
if [ -z "$body" ]; then $SUDO systemctl --no-pager --full status teswa-realtime || true; $SUDO journalctl -u teswa-realtime -n 30 --no-pager || true; echo "realtime_shell=FAIL reason=health_timeout"; exit 16; fi
printf "%s\n" "$body" | jq -e ".status==\"ok\" and .service==\"teswa-realtime\" and .websocket==false and .productionTraffic==false" >/dev/null
systemctl is-active --quiet teswa-realtime
systemctl is-enabled --quiet teswa-realtime
[ "$($SUDO podman inspect -f "{{.State.Running}}" teswa-realtime)" = true ]
ss -ltnH | grep -Eq "[[:space:]]127\\.0\\.0\\.1:3200[[:space:]]"
if ss -ltnH | grep -Eq "[[:space:]](0\\.0\\.0\\.0|\\[::\\]|\\*):3200[[:space:]]"; then echo "realtime_shell=FAIL reason=public_listener"; exit 17; fi
open=false
if systemctl is-active --quiet firewalld && $SUDO firewall-cmd --quiet --query-port=3200/tcp; then open=true; fi
[ "$open" = false ] || { echo "realtime_shell=FAIL reason=firewall_open"; exit 18; }
echo "service_active=active"
echo "service_enabled=enabled"
echo "container_running=true"
echo "listen_addresses=127.0.0.1"
echo "port=3200"
echo "health_status=ok"
echo "websocket_claim=false"
echo "image_digest=$digest"
echo "firewall_3200_open=false"
echo "credentials_created=false"
echo "production_traffic=false"
echo "realtime_runtime_shell=PASS"'

guest_script_bytes="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 6 CORE REALTIME RUNTIME SHELL APPLY"
echo "mutation=core_realtime_health_shell_only"
echo "target=teswa-core-01"
echo "listen_target=127.0.0.1:3200"
echo "websocket_claim=false"
echo "credentials_created=false"
echo "data_migration=none"
echo "production_cutover=none"
echo "supabase_change=none"
echo "dns_change=none"
echo "guest_script_bytes=$guest_script_bytes"

if [ "$guest_script_bytes" -gt 4096 ]; then
  echo "realtime_runtime_shell=FAIL reason=run_command_plaintext_limit" >&2
  exit 4
fi

content_file="$(mktemp)"
target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT

python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"source":{"sourceType":"TEXT","text":text},"output":{"outputType":"TEXT"}},f)
PY

python3 - "$target_file" "$INSTANCE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

COMMAND_ID="$(oci instance-agent command create \
  --compartment-id "$COMPARTMENT" \
  --content "file://$content_file" \
  --target "file://$target_file" \
  --timeout-in-seconds 1200 \
  --display-name "teswa-phase6-core-realtime-runtime-shell" \
  --query 'data.id' \
  --raw-output)"

elapsed=0
last_state=""
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --output json)"

  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))
')"

  if [ "$STATE" != "$last_state" ]; then
    echo "run_command_state=$STATE"
    last_state="$STATE"
  fi

  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
c=d.get("content") or {}
print("exit_code=%s" % c.get("exit-code"))
print((c.get("text") or "").rstrip())
if c.get("exit-code") not in (0,None):
    raise SystemExit(5)
'
    exit 0
  fi

  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{})
c=d.get("content") or {}
print("message=%s" % (c.get("message") or ""))
print((c.get("text") or "").rstrip())
'
    exit 6
  fi

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "realtime_runtime_shell=FAIL reason=poll_timeout state=$STATE"
    exit 7
  fi

  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
