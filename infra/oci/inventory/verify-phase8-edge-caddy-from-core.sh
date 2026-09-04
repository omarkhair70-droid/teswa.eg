#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-210}"
OCI_RETRIES="${OCI_RETRIES:-4}"

printf '%s\n' "TESWA PHASE 8 EDGE CADDY PRIVATE VERIFY"
printf '%s\n' "probe_origin=teswa-core-01"
printf '%s\n' "edge_run_command_dependency=none"
printf '%s\n' "console_history_dependency=none"
printf '%s\n' "public_8080_expected=false"

[ -x "$TF" ] || { echo "phase8_caddy_core_verify=FAIL reason=terraform_missing" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "phase8_caddy_core_verify=FAIL reason=oci_cli_missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "phase8_caddy_core_verify=FAIL reason=python_missing" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
[ -n "$COMPARTMENT" ] || { echo "phase8_caddy_core_verify=FAIL reason=missing_compartment" >&2; exit 2; }

tmp_err="$(mktemp)"
content_file=""
target_file=""
cleanup() { rm -f "$tmp_err" "$content_file" "$target_file"; }
trap cleanup EXIT INT TERM

capture() {
  local __var="$1" label="$2"
  shift 2
  local attempt=1 out rc
  while [ "$attempt" -le "$OCI_RETRIES" ]; do
    : > "$tmp_err"
    set +e
    out="$("$@" 2>"$tmp_err")"
    rc=$?
    set -e
    if [ "$rc" -eq 0 ] && [ -n "$out" ]; then
      printf -v "$__var" '%s' "$out"
      return 0
    fi
    echo "oci_retry label=$label attempt=$attempt rc=$rc stdout_bytes=${#out}"
    if [ -s "$tmp_err" ]; then
      tr '\n' ' ' < "$tmp_err" | cut -c1-360 | sed 's/^/oci_stderr=/'
      echo
    fi
    sleep $((attempt * 2))
    attempt=$((attempt + 1))
  done
  echo "phase8_caddy_core_verify=FAIL reason=oci_controlplane_unavailable label=$label" >&2
  return 1
}

capture EDGE_ID edge_instance oci compute instance list \
  --compartment-id "$COMPARTMENT" --display-name teswa-edge-01 \
  --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output
capture CORE_ID core_instance oci compute instance list \
  --compartment-id "$COMPARTMENT" --display-name teswa-core-01 \
  --lifecycle-state RUNNING --all --query 'data[0].id' --raw-output
capture EDGE_PRIVATE_IP edge_private_ip oci compute instance list-vnics \
  --instance-id "$EDGE_ID" --query 'data[0]."private-ip"' --raw-output
capture EDGE_NSG_ID edge_nsg oci network nsg list \
  --compartment-id "$COMPARTMENT" --all \
  --query 'data[?"display-name"==`teswa-edge-nsg`].id | [0]' --raw-output
capture APP_NSG_ID app_nsg oci network nsg list \
  --compartment-id "$COMPARTMENT" --all \
  --query 'data[?"display-name"==`teswa-app-nsg`].id | [0]' --raw-output

for pair in "edge:$EDGE_ID" "core:$CORE_ID" "edge_ip:$EDGE_PRIVATE_IP" "edge_nsg:$EDGE_NSG_ID" "app_nsg:$APP_NSG_ID"; do
  label="${pair%%:*}"
  value="${pair#*:}"
  [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "None" ] || {
    echo "phase8_caddy_core_verify=FAIL reason=missing_runtime_identity target=$label" >&2
    exit 3
  }
done

echo "runtime_instances=resolved"
echo "probe_target=$EDGE_PRIVATE_IP:8080"

capture RULES edge_nsg_rules oci network nsg rules list \
  --nsg-id "$EDGE_NSG_ID" --all --output json

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
if not private_ok:
    raise SystemExit("phase8_caddy_core_verify=FAIL reason=private_8080_rule_missing")
if public_8080:
    raise SystemExit("phase8_caddy_core_verify=FAIL reason=public_8080_detected")
PY

echo "network_gate=PASS"

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

capture COMMAND_ID core_probe_create oci instance-agent command create \
  --compartment-id "$COMPARTMENT" \
  --content "file://$content_file" \
  --target "file://$target_file" \
  --timeout-in-seconds 150 \
  --display-name teswa-phase8-edge-caddy-private-verify \
  --query 'data.id' --raw-output

echo "command_id=$COMMAND_ID"
echo "core_probe_created=true"

elapsed=0
while true; do
  capture EXEC_JSON core_probe_execution oci instance-agent command-execution get \
    --command-id "$COMMAND_ID" --instance-id "$CORE_ID" --output json
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
    exit 4
  fi

  case "$STATE" in
    FAILED|TIMED_OUT|CANCELED)
      printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print((c.get("text") or c.get("message") or "").rstrip()); print("exit_code=%s" % c.get("exit-code"))'
      echo "phase8_caddy_core_verify=FAIL reason=core_probe_$STATE"
      exit 5
      ;;
  esac

  [ "$elapsed" -lt "$MAX_WAIT_SECONDS" ] || {
    echo "phase8_caddy_core_verify=FAIL reason=core_probe_timeout state=$STATE delivery=$DELIVERY"
    exit 6
  }
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done
