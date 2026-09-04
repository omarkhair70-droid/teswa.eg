#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-5}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-1800}"

[ -x "$TF" ] || { echo "Terraform binary not found at $TF" >&2; exit 1; }
if [ "${TESWA_ALLOW_EDGE_CADDY_SHELL:-}" != "YES" ]; then
  echo "Refusing guest mutation: set TESWA_ALLOW_EDGE_CADDY_SHELL=YES." >&2
  exit 2
fi

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
INSTANCE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "null" ] || { echo "teswa-edge-01 is not RUNNING." >&2; exit 3; }

SCRIPT_TEXT='set -Eeuo pipefail
echo "run_as_user=$(id -un)"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif sudo -n true 2>/dev/null; then SUDO=sudo; else echo "caddy_shell=FAIL reason=no_privilege"; exit 10; fi
echo "TESWA PHASE 8 EDGE CADDY RUNTIME SHELL"
echo "target=teswa-edge-01"
echo "mode=loopback-shell-only"
echo "production_cutover=none"
echo "dns_change=none"
echo "core_change=none"
echo "public_listener=none"
command -v dnf >/dev/null || { echo "caddy_shell=FAIL reason=dnf_missing"; exit 11; }
if $SUDO test -e /etc/teswa/phase8-caddy-shell-owned; then owned=true; else owned=false; fi
if rpm -q caddy >/dev/null 2>&1 && [ "$owned" != true ]; then echo "caddy_shell=FAIL reason=unowned_existing_caddy"; exit 12; fi
$SUDO dnf -y install dnf-plugins-core >/dev/null
$SUDO dnf -y copr enable @caddy/caddy >/dev/null
$SUDO dnf -y install caddy >/dev/null
$SUDO install -d -m 0755 /etc/teswa
$SUDO touch /etc/teswa/phase8-caddy-shell-owned
t="$(mktemp)"
printf "%s\n" \
  "{" \
  "  auto_https off" \
  "  admin off" \
  "}" \
  "http://127.0.0.1:8080 {" \
  "  @health path /healthz" \
  "  respond @health teswa-edge-caddy-ok 200" \
  "  respond 404" \
  "}" > "$t"
$SUDO install -o root -g caddy -m 0640 "$t" /etc/caddy/Caddyfile
rm -f "$t"
$SUDO caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
$SUDO systemctl enable --now caddy
for _ in $(seq 1 20); do systemctl is-active --quiet caddy && curl -fsS http://127.0.0.1:8080/healthz | grep -Fq teswa-edge-caddy-ok && break; sleep 1; done
systemctl is-active --quiet caddy || { $SUDO systemctl --no-pager --full status caddy || true; $SUDO journalctl -u caddy -n 40 --no-pager || true; echo "caddy_shell=FAIL reason=service_inactive"; exit 13; }
curl -fsS http://127.0.0.1:8080/healthz | grep -Fq teswa-edge-caddy-ok || { echo "caddy_shell=FAIL reason=health_failed"; exit 14; }
ss -ltnH | grep -Eq "127\\.0\\.0\\.1:8080[[:space:]]" || { echo "caddy_shell=FAIL reason=loopback_listener_missing"; exit 15; }
if ss -ltnH | grep -Eq "(^|[[:space:]])([^[:space:]]*:)?(80|443)[[:space:]]"; then echo "caddy_shell=FAIL reason=unexpected_public_listener"; exit 16; fi
if $SUDO firewall-cmd --query-port=8080/tcp >/dev/null 2>&1; then echo "caddy_shell=FAIL reason=firewall_8080_open"; exit 17; fi
echo "caddy_version=$(caddy version | awk "{print \$1}")"
echo "service_active=active"
echo "service_enabled=enabled"
echo "listen_address=127.0.0.1"
echo "port=8080"
echo "health_status=ok"
echo "public_listener=false"
echo "firewall_8080_open=false"
echo "production_traffic=false"
echo "edge_caddy_runtime_shell=PASS"'

guest_script_bytes="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 8 EDGE CADDY RUNTIME SHELL APPLY"
echo "mutation=edge_caddy_runtime_shell_only"
echo "target=teswa-edge-01"
echo "listen_target=127.0.0.1:8080"
echo "dns_change=none"
echo "production_cutover=none"
echo "public_listener=none"
echo "guest_script_bytes=$guest_script_bytes"
if [ "$guest_script_bytes" -gt 4096 ]; then echo "edge_caddy_runtime_shell=FAIL reason=run_command_plaintext_limit" >&2; exit 4; fi

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
COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 1200 --display-name "teswa-phase8-edge-caddy-runtime-shell" --query 'data.id' --raw-output)"
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
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "edge_caddy_runtime_shell=FAIL reason=poll_timeout state=$STATE"; exit 7; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done
