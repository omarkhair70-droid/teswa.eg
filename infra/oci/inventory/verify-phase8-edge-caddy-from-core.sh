#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-210}"

[ -x "$TF" ] || { echo "phase8_caddy_core_verify=FAIL reason=terraform_missing" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "phase8_caddy_core_verify=FAIL reason=oci_cli_missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "phase8_caddy_core_verify=FAIL reason=python_missing" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"

EDGE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-edge-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"
CORE_ID="$(oci compute instance list \
  --compartment-id "$COMPARTMENT" \
  --display-name teswa-core-01 \
  --lifecycle-state RUNNING \
  --all \
  --query 'data[0].id' \
  --raw-output)"
EDGE_PRIVATE_IP="$(oci compute instance list-vnics \
  --instance-id "$EDGE_ID" \
  --query 'data[0]."private-ip"' \
  --raw-output)"

for value in "$EDGE_ID" "$CORE_ID" "$EDGE_PRIVATE_IP"; do
  [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "None" ] || {
    echo "phase8_caddy_core_verify=FAIL reason=missing_runtime_identity" >&2
    exit 2
  }
done

EDGE_NSG_ID="$(oci network nsg list \
  --compartment-id "$COMPARTMENT" \
  --all \
  --query 'data[?"display-name"==`teswa-edge-nsg`].id | [0]' \
  --raw-output)"
APP_NSG_ID="$(oci network nsg list \
  --compartment-id "$COMPARTMENT" \
  --all \
  --query 'data[?"display-name"==`teswa-app-nsg`].id | [0]' \
  --raw-output)"
RULES="$(oci network nsg rules list --network-security-group-id "$EDGE_NSG_ID" --all --output json)"

python3 - "$APP_NSG_ID" "$RULES" <<'PY'
import json,sys
app_nsg,raw=sys.argv[1:]
rows=json.loads(raw).get("data",[])
private_ok=False
public_8080=False
for r in rows:
    opts=r.get("tcp-options") or {}
    rng=opts.get("destination-port-range") or {}
    lo,hi=rng.get("min"),rng.get("max")
    covers=lo is not None and hi is not None and lo <= 8080 <= hi
    if not covers or r.get("direction") != "INGRESS" or r.get("protocol") != "6":
        continue
    if r.get("source-type") == "NETWORK_SECURITY_GROUP" and r.get("source") == app_nsg:
        private_ok=True
    if r.get("source-type") == "CIDR_BLOCK" and r.get("source") in ("0.0.0.0/0","::/0"):
        public_8080=True
print(f"edge_8080_from_app_nsg={'true' if private_ok else 'false'}")
print(f"edge_8080_public_ingress={'true' if public_8080 else 'false'}")
if not private_ok or public_8080:
    raise SystemExit(20)
PY

SCRIPT_TEXT="set -Eeuo pipefail
EDGE_PRIVATE_IP='$EDGE_PRIVATE_IP'
echo \"run_as_user=\$(id -un)\"
echo \"edge_private_ip=\$EDGE_PRIVATE_IP\"
for i in \$(seq 1 60); do
  body=\$(curl --fail --silent --show-error --connect-timeout 3 --max-time 5 \"http://\$EDGE_PRIVATE_IP:8080/healthz\" 2>/dev/null || true)
  if [ \"\$body\" = 'teswa-edge-caddy-ok' ]; then
    echo \"health_body=\$body\"
    echo \"private_health_ok=true\"
    exit 0
  fi
  sleep 2
done
echo \"private_health_ok=false\"
exit 21"

content_file="$(mktemp)"
target_file="$(mktemp)"
trap 'rm -f "$content_file" "$target_file"' EXIT
python3 - "$content_file" "$SCRIPT_TEXT" <<'PY'
import json,sys
path,text=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"source":{"sourceType":"TEXT","text":text},"output":{"outputType":"TEXT"}},f)
PY
python3 - "$target_file" "$CORE_ID" <<'PY'
import json,sys
path,instance_id=sys.argv[1:]
with open(path,"w",encoding="utf-8") as f:
    json.dump({"instanceId":instance_id},f)
PY

COMMAND_ID="$(oci instance-agent command create \
  --compartment-id "$COMPARTMENT" \
  --content "file://$content_file" \
  --target "file://$target_file" \
  --timeout-in-seconds 150 \
  --display-name teswa-phase8-edge-caddy-private-verify \
  --query 'data.id' \
  --raw-output)"

echo "TESWA PHASE 8 EDGE CADDY PRIVATE VERIFY"
echo "probe_origin=teswa-core-01"
echo "probe_target=$EDGE_PRIVATE_IP:8080"
echo "edge_run_command_dependency=none"
echo "console_history_dependency=none"
echo "public_8080_expected=false"
echo "command_id=$COMMAND_ID"

elapsed=0
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get \
    --command-id "$COMMAND_ID" \
    --instance-id "$CORE_ID" \
    --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  DELIVERY="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("delivery-state",""))')"
  echo "verify_state=$STATE delivery=$DELIVERY elapsed_seconds=$elapsed"

  if [ "$STATE" = "SUCCEEDED" ]; then
    OUTPUT="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print((c.get("text") or "").rstrip()); print("exit_code=%s" % c.get("exit-code"))')"
    printf '%s\n' "$OUTPUT"
    if printf '%s\n' "$OUTPUT" | grep -q '^private_health_ok=true$' && printf '%s\n' "$OUTPUT" | grep -q '^exit_code=0$'; then
      echo "edge_listener_scope=private_ip_only"
      echo "public_listener_80_443_change=none"
      echo "dns_change=none"
      echo "production_cutover=none"
      echo "phase8_caddy_core_verify=PASS"
      exit 0
    fi
    echo "phase8_caddy_core_verify=FAIL reason=private_health_not_green"
    exit 3
  fi

  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print((c.get("text") or c.get("message") or "").rstrip()); print("exit_code=%s" % c.get("exit-code"))'
    echo "phase8_caddy_core_verify=FAIL reason=core_probe_$STATE"
    exit 4
  fi

  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "phase8_caddy_core_verify=FAIL reason=core_probe_timeout state=$STATE delivery=$DELIVERY"
    exit 5
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
