#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1800}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }

if [ "${TESWA_ALLOW_CORE_WORKERS_SHELL:-}" != "YES" ]; then
  echo "Refusing guest mutation: set TESWA_ALLOW_CORE_WORKERS_SHELL=YES." >&2
  exit 2
fi

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo "teswa-core-01 is not RUNNING." >&2; exit 3; }

SCRIPT_TEXT='set -Eeuo pipefail
echo "run_as_user=$(id -un)"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif sudo -n true 2>/dev/null; then SUDO=sudo; else echo "workers_shell=FAIL reason=no_privilege"; exit 10; fi
echo "TESWA PHASE 7 CORE WORKERS SHELL"
echo "target=teswa-core-01"
echo "mode=runtime-shell-only"
echo "listener=none"
echo "credentials_created=false"
echo "data_migration=none"
echo "production_cutover=none"
echo "supabase_change=none"
command -v podman >/dev/null || { echo "workers_shell=FAIL reason=podman_missing"; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo "workers_shell=FAIL reason=postgres_inactive"; exit 12; }
systemctl is-active --quiet teswa-api || { echo "workers_shell=FAIL reason=api_inactive"; exit 13; }
systemctl is-active --quiet teswa-realtime || { echo "workers_shell=FAIL reason=realtime_inactive"; exit 14; }
M=/etc/teswa/phase7-workers-shell-owned
U=/etc/systemd/system/teswa-workers.service
if $SUDO test -e "$U" && ! $SUDO test -e "$M"; then echo "workers_shell=FAIL reason=unowned_unit"; exit 15; fi
if $SUDO test -e "$M"; then $SUDO systemctl stop teswa-workers >/dev/null 2>&1 || true; fi
$SUDO install -d -m 0755 /etc/teswa
$SUDO podman pull docker.io/library/python:3.13-alpine >/dev/null
digest="$($SUDO podman image inspect docker.io/library/python:3.13-alpine --format "{{.Digest}}")"
t="$(mktemp)"
cat >"$t" <<EOF
[Unit]
Description=Teswa Workers runtime shell
After=network-online.target teswa-api.service teswa-realtime.service
Requires=teswa-api.service teswa-realtime.service
[Service]
Restart=always
RestartSec=3
ExecStartPre=-/usr/bin/podman rm -f teswa-workers
ExecStart=/usr/bin/podman run --pull=never --name teswa-workers --network none --read-only --cap-drop=all --security-opt=no-new-privileges --pids-limit=32 --memory=64m docker.io/library/python:3.13-alpine python -u -c "import time; print(\"teswa-workers-ready\", flush=True); time.sleep(10**9)"
ExecStop=/usr/bin/podman stop -t 10 teswa-workers
ExecStopPost=-/usr/bin/podman rm -f teswa-workers
[Install]
WantedBy=multi-user.target
EOF
$SUDO install -m 0644 "$t" "$U"; rm -f "$t"; $SUDO touch "$M"
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now teswa-workers
for _ in $(seq 1 20); do systemctl is-active --quiet teswa-workers && [ "$($SUDO podman inspect -f "{{.State.Running}}" teswa-workers 2>/dev/null || true)" = true ] && break; sleep 1; done
systemctl is-active --quiet teswa-workers || { $SUDO systemctl --no-pager --full status teswa-workers || true; $SUDO journalctl -u teswa-workers -n 30 --no-pager || true; echo "workers_shell=FAIL reason=service_inactive"; exit 16; }
systemctl is-enabled --quiet teswa-workers
[ "$($SUDO podman inspect -f "{{.State.Running}}" teswa-workers)" = true ]
$SUDO podman logs teswa-workers 2>&1 | grep -Fq "teswa-workers-ready"
if ss -ltnpH | grep -Fq "teswa-workers"; then echo "workers_shell=FAIL reason=unexpected_listener"; exit 17; fi
echo "service_active=active"
echo "service_enabled=enabled"
echo "container_running=true"
echo "network_mode=none"
echo "listener=none"
echo "ready_marker=teswa-workers-ready"
echo "image_digest=$digest"
echo "credentials_created=false"
echo "production_traffic=false"
echo "workers_runtime_shell=PASS"'

guest_script_bytes="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 7 CORE WORKERS RUNTIME SHELL APPLY"
echo "mutation=core_workers_runtime_shell_only"
echo "target=teswa-core-01"
echo "listener=none"
echo "credentials_created=false"
echo "data_migration=none"
echo "production_cutover=none"
echo "supabase_change=none"
echo "dns_change=none"
echo "guest_script_bytes=$guest_script_bytes"
if [ "$guest_script_bytes" -gt 4096 ]; then echo "workers_runtime_shell=FAIL reason=run_command_plaintext_limit" >&2; exit 4; fi

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
COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 1200 --display-name "teswa-phase7-core-workers-runtime-shell" --query 'data.id' --raw-output)"
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
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "workers_runtime_shell=FAIL reason=poll_timeout state=$STATE"; exit 7; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done
