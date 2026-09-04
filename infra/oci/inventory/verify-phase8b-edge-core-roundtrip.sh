#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-300}"

[ -x "$TF" ] || { echo "phase8b_roundtrip=FAIL reason=terraform_missing" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "phase8b_roundtrip=FAIL reason=oci_cli_missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "phase8b_roundtrip=FAIL reason=python_missing" >&2; exit 1; }
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"

COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_EXPECTED_IP="$("$TF" output -raw teswa_core_private_ip)"
EDGE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
CORE_ID="$(oci compute instance list --compartment-id "$COMPARTMENT" --display-name teswa-core-01 --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output)"
EDGE_IP="$(oci compute instance list-vnics --instance-id "$EDGE_ID" --query 'data[0]."private-ip"' --raw-output)"
CORE_IP="$(oci compute instance list-vnics --instance-id "$CORE_ID" --query 'data[0]."private-ip"' --raw-output)"

for pair in "edge_id:$EDGE_ID" "core_id:$CORE_ID" "edge_ip:$EDGE_IP" "core_ip:$CORE_IP"; do
  label="${pair%%:*}"; value="${pair#*:}"
  [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "None" ] || { echo "phase8b_roundtrip=FAIL reason=missing_runtime_value target=$label"; exit 2; }
done
[ "$CORE_IP" = "$CORE_EXPECTED_IP" ] || { echo "phase8b_roundtrip=FAIL reason=core_private_ip_drift expected=$CORE_EXPECTED_IP actual=$CORE_IP"; exit 3; }

echo "TESWA PHASE 8B EDGE CORE ROUNDTRIP VERIFY"
echo "probe_origin=teswa-core-01"
echo "edge_private_ip=$EDGE_IP"
echo "core_private_ip=$CORE_IP"
echo "edge_run_command_dependency=none"
echo "public_listener_change=none"
echo "dns_change=none"
echo "production_cutover=none"

read -r -d '' SCRIPT_TEXT <<'GUEST' || true
set -Eeuo pipefail
EDGE_IP="__EDGE_IP__"
CORE_IP="__CORE_IP__"
echo "run_as_user=$(id -un)"
systemctl is-active --quiet teswa-api
systemctl is-active --quiet teswa-realtime
systemctl is-active --quiet postgresql-17
api_direct="$(curl -fsS "http://$CORE_IP:3100/healthz")"
rt_direct="$(curl -fsS "http://$CORE_IP:3200/healthz")"
edge_health="$(curl -fsS "http://$EDGE_IP:8080/healthz")"
api_roundtrip="$(curl -fsS "http://$EDGE_IP:8080/internal/api-health")"
rt_roundtrip="$(curl -fsS "http://$EDGE_IP:8080/internal/realtime-health")"
printf '%s' "$api_direct" | grep -Fq '"service":"teswa-api"'
printf '%s' "$rt_direct" | grep -Fq '"service":"teswa-realtime"'
[ "$edge_health" = "teswa-edge-caddy-ok" ]
printf '%s' "$api_roundtrip" | grep -Fq '"service":"teswa-api"'
printf '%s' "$rt_roundtrip" | grep -Fq '"service":"teswa-realtime"'
ss -ltnH | grep -Fq "$CORE_IP:3100"
ss -ltnH | grep -Fq "$CORE_IP:3200"
ss -ltnH | grep -Fq '127.0.0.1:5432'
echo "edge_health=$edge_health"
echo "api_direct_ok=true"
echo "realtime_direct_ok=true"
echo "api_roundtrip_ok=true"
echo "realtime_roundtrip_ok=true"
echo "postgres_listener=127.0.0.1:5432"
echo "phase8b_roundtrip=PASS"
GUEST
SCRIPT_TEXT="${SCRIPT_TEXT//__EDGE_IP__/$EDGE_IP}"
SCRIPT_TEXT="${SCRIPT_TEXT//__CORE_IP__/$CORE_IP}"

content_file="$(mktemp)"; target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT
python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
with open(sys.argv[1],"w",encoding="utf-8") as f: json.dump({"source":{"sourceType":"TEXT","text":sys.argv[2]},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$CORE_ID" <<'PY'
import json,sys
with open(sys.argv[1],"w",encoding="utf-8") as f: json.dump({"instanceId":sys.argv[2]},f)
PY
COMMAND_ID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$content_file" --target "file://$target_file" --timeout-in-seconds 240 --display-name teswa-phase8b-edge-core-roundtrip --query 'data.id' --raw-output)"
echo "command_id=$COMMAND_ID"

elapsed=0
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$CORE_ID" --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  DELIVERY="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("delivery-state",""))')"
  echo "roundtrip_state=$STATE delivery=$DELIVERY elapsed_seconds=$elapsed"
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print("exit_code=%s"%c.get("exit-code")); print((c.get("text") or "").rstrip()); raise SystemExit(0 if c.get("exit-code") in (0,None) else 5)'
    exit 0
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print((c.get("text") or c.get("message") or "").rstrip()); print("exit_code=%s"%c.get("exit-code"))'
    echo "phase8b_roundtrip=FAIL reason=core_command_$STATE"
    exit 6
  fi
  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || { echo "phase8b_roundtrip=FAIL reason=poll_timeout state=$STATE delivery=$DELIVERY"; exit 7; }
  sleep "$POLL_SECONDS"; elapsed=$((elapsed + POLL_SECONDS))
done
