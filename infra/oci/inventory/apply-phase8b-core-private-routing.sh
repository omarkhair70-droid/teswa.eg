#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-300}"

[ -x "$TF" ] || { echo "phase8b_core_apply=FAIL reason=terraform_missing" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "phase8b_core_apply=FAIL reason=oci_cli_missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "phase8b_core_apply=FAIL reason=python_missing" >&2; exit 1; }
[ "${TESWA_ALLOW_PHASE8B_CORE_ROUTING:-}" = "YES" ] || {
  echo "Refusing guest mutation: set TESWA_ALLOW_PHASE8B_CORE_ROUTING=YES." >&2
  exit 2
}

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_PRIVATE_IP="$("$TF" output -raw teswa_core_private_ip)"
CORE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
EDGE_PRIVATE_IP="$(oci compute instance list-vnics --instance-id "$EDGE_ID" --query 'data[0]."private-ip"' --raw-output)"

for pair in "core_id:$CORE_ID" "edge_id:$EDGE_ID" "core_ip:$CORE_PRIVATE_IP" "edge_ip:$EDGE_PRIVATE_IP"; do
  label="${pair%%:*}"; value="${pair#*:}"
  [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "None" ] || {
    echo "phase8b_core_apply=FAIL reason=missing_runtime_value target=$label" >&2
    exit 3
  }
done

read -r -d '' SCRIPT_TEXT <<'GUEST' || true
set -Eeuo pipefail
CORE_PRIVATE_IP="__CORE_PRIVATE_IP__"
EDGE_PRIVATE_IP="__EDGE_PRIVATE_IP__"
if [ "$(id -u)" -eq 0 ]; then SUDO=""; elif sudo -n true 2>/dev/null; then SUDO=sudo; else echo "phase8b_core=FAIL reason=no_privilege"; exit 10; fi
API=/etc/systemd/system/teswa-api.service
RT=/etc/systemd/system/teswa-realtime.service
AB=/etc/teswa/phase8b-api.pre-private
RB=/etc/teswa/phase8b-realtime.pre-private
R3100="rule family=\"ipv4\" source address=\"$EDGE_PRIVATE_IP/32\" port port=\"3100\" protocol=\"tcp\" accept"
R3200="rule family=\"ipv4\" source address=\"$EDGE_PRIVATE_IP/32\" port port=\"3200\" protocol=\"tcp\" accept"
rollback() {
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "phase8b_core_rollback=START rc=$rc"
    [ -f "$AB" ] && $SUDO cp -f "$AB" "$API" || true
    [ -f "$RB" ] && $SUDO cp -f "$RB" "$RT" || true
    if systemctl is-active --quiet firewalld; then
      $SUDO firewall-cmd --permanent --remove-rich-rule="$R3100" >/dev/null 2>&1 || true
      $SUDO firewall-cmd --permanent --remove-rich-rule="$R3200" >/dev/null 2>&1 || true
      $SUDO firewall-cmd --reload >/dev/null 2>&1 || true
    fi
    $SUDO systemctl daemon-reload || true
    $SUDO systemctl restart teswa-api teswa-realtime || true
    echo "phase8b_core_rollback=ATTEMPTED"
  fi
}
trap rollback EXIT

systemctl is-active --quiet teswa-api || { echo "phase8b_core=FAIL reason=api_inactive"; exit 11; }
systemctl is-active --quiet teswa-realtime || { echo "phase8b_core=FAIL reason=realtime_inactive"; exit 12; }
systemctl is-active --quiet postgresql-17 || { echo "phase8b_core=FAIL reason=postgres_inactive"; exit 13; }
$SUDO test -f /etc/teswa/phase5-api-shell-owned || { echo "phase8b_core=FAIL reason=api_not_owned"; exit 14; }
$SUDO test -f /etc/teswa/phase6-realtime-shell-owned || { echo "phase8b_core=FAIL reason=realtime_not_owned"; exit 15; }
$SUDO cp -n "$API" "$AB"
$SUDO cp -n "$RT" "$RB"

for U in "$API" "$RT"; do
  if $SUDO grep -q -- "--bind 127.0.0.1" "$U"; then
    $SUDO sed -i "s/--bind 127.0.0.1/--bind $CORE_PRIVATE_IP/g" "$U"
  fi
  $SUDO grep -q -- "--bind $CORE_PRIVATE_IP" "$U" || { echo "phase8b_core=FAIL reason=unit_bind_not_target unit=$U"; exit 16; }
done

systemctl is-active --quiet firewalld || { echo "phase8b_core=FAIL reason=firewalld_inactive"; exit 17; }
$SUDO firewall-cmd --permanent --add-rich-rule="$R3100" >/dev/null
$SUDO firewall-cmd --permanent --add-rich-rule="$R3200" >/dev/null
$SUDO firewall-cmd --reload >/dev/null
$SUDO systemctl daemon-reload
$SUDO systemctl restart teswa-api teswa-realtime

for port in 3100 3200; do
  for _ in $(seq 1 20); do
    curl -fsS "http://$CORE_PRIVATE_IP:$port/healthz" >/dev/null 2>&1 && break || true
    sleep 1
  done
  curl -fsS "http://$CORE_PRIVATE_IP:$port/healthz" >/dev/null || { echo "phase8b_core=FAIL reason=private_health port=$port"; exit 18; }
  ss -ltnH | grep -Fq "$CORE_PRIVATE_IP:$port" || { echo "phase8b_core=FAIL reason=listener_missing port=$port"; exit 19; }
done

if ss -ltnH | grep -Eq '[[:space:]](0\.0\.0\.0|\[::\]|\*):(3100|3200)[[:space:]]'; then echo "phase8b_core=FAIL reason=wildcard_listener"; exit 20; fi
$SUDO firewall-cmd --quiet --query-rich-rule="$R3100" || { echo "phase8b_core=FAIL reason=firewall_3100_missing"; exit 21; }
$SUDO firewall-cmd --quiet --query-rich-rule="$R3200" || { echo "phase8b_core=FAIL reason=firewall_3200_missing"; exit 22; }
$SUDO firewall-cmd --quiet --query-port=3100/tcp && { echo "phase8b_core=FAIL reason=global_3100_open"; exit 23; } || true
$SUDO firewall-cmd --quiet --query-port=3200/tcp && { echo "phase8b_core=FAIL reason=global_3200_open"; exit 24; } || true
ss -ltnH | grep -Fq '127.0.0.1:5432' || { echo "phase8b_core=FAIL reason=postgres_listener_changed"; exit 25; }

trap - EXIT
echo "api_listener=$CORE_PRIVATE_IP:3100"
echo "realtime_listener=$CORE_PRIVATE_IP:3200"
echo "firewall_source=$EDGE_PRIVATE_IP/32"
echo "firewall_global_3100=false"
echo "firewall_global_3200=false"
echo "postgres_listener=127.0.0.1:5432"
echo "postgres_change=none"
echo "credentials_created=false"
echo "data_migration=none"
echo "dns_change=none"
echo "production_cutover=none"
echo "phase8b_core_private_routing=PASS"
GUEST
SCRIPT_TEXT="${SCRIPT_TEXT//__CORE_PRIVATE_IP__/$CORE_PRIVATE_IP}"
SCRIPT_TEXT="${SCRIPT_TEXT//__EDGE_PRIVATE_IP__/$EDGE_PRIVATE_IP}"

bytes="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "TESWA PHASE 8B CORE PRIVATE ROUTING APPLY"
echo "mutation=core_api_realtime_private_bind_and_edge_only_firewall"
echo "core_private_ip=$CORE_PRIVATE_IP"
echo "edge_private_ip=$EDGE_PRIVATE_IP"
echo "postgres_change=none"
echo "public_listener_change=none"
echo "dns_change=none"
echo "production_cutover=none"
echo "guest_script_bytes=$bytes"
[ "$bytes" -le 4096 ] || { echo "phase8b_core_apply=FAIL reason=run_command_plaintext_limit" >&2; exit 4; }

content_file="$(mktemp)"; target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT
python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
with open(sys.argv[1],"w",encoding="utf-8") as f:
    json.dump({"source":{"sourceType":"TEXT","text":sys.argv[2]},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$CORE_ID" <<'PY'
import json,sys
with open(sys.argv[1],"w",encoding="utf-8") as f:
    json.dump({"instanceId":sys.argv[2]},f)
PY

COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 240 --display-name teswa-phase8b-core-private-routing --query 'data.id' --raw-output)"
echo "command_id=$COMMAND_ID"

elapsed=0
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$CORE_ID" --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  DELIVERY="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("delivery-state",""))')"
  echo "core_apply_state=$STATE delivery=$DELIVERY elapsed_seconds=$elapsed"
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print("exit_code=%s"%c.get("exit-code")); print((c.get("text") or "").rstrip()); raise SystemExit(0 if c.get("exit-code") in (0,None) else 5)'
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print((c.get("text") or c.get("message") or "").rstrip()); print("exit_code=%s"%c.get("exit-code"))'
    echo "phase8b_core_apply=FAIL reason=core_command_$STATE"
    exit 6
  fi
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "phase8b_core_apply=FAIL reason=poll_timeout state=$STATE delivery=$DELIVERY"; exit 7; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done
