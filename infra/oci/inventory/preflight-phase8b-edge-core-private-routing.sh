#!/usr/bin/env bash
set -Eeuo pipefail

TF="${TF_BIN:-$HOME/.local/bin/terraform}"
POLL_SECONDS="${POLL_SECONDS:-3}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-90}"

[ -x "$TF" ] || { echo "phase8b_preflight=FAIL reason=terraform_missing" >&2; exit 1; }
command -v oci >/dev/null 2>&1 || { echo "phase8b_preflight=FAIL reason=oci_cli_missing" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "phase8b_preflight=FAIL reason=python_missing" >&2; exit 1; }

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"
COMPARTMENT="$("$TF" output -raw teswa_compartment_id)"
CORE_EXPECTED_IP="$("$TF" output -raw teswa_core_private_ip)"

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

for value in "$EDGE_ID" "$CORE_ID"; do
  [ -n "$value" ] && [ "$value" != "null" ] && [ "$value" != "None" ] || {
    echo "phase8b_preflight=FAIL reason=missing_running_instance" >&2
    exit 2
  }
done

EDGE_PRIVATE_IP="$(oci compute instance list-vnics \
  --instance-id "$EDGE_ID" \
  --query 'data[0]."private-ip"' \
  --raw-output)"
CORE_PRIVATE_IP="$(oci compute instance list-vnics \
  --instance-id "$CORE_ID" \
  --query 'data[0]."private-ip"' \
  --raw-output)"

[ -n "$EDGE_PRIVATE_IP" ] && [ "$EDGE_PRIVATE_IP" != "null" ] && [ "$EDGE_PRIVATE_IP" != "None" ] || {
  echo "phase8b_preflight=FAIL reason=edge_private_ip_missing" >&2
  exit 3
}
[ "$CORE_PRIVATE_IP" = "$CORE_EXPECTED_IP" ] || {
  echo "phase8b_preflight=FAIL reason=core_private_ip_drift expected=$CORE_EXPECTED_IP actual=$CORE_PRIVATE_IP" >&2
  exit 4
}

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

[ -n "$EDGE_NSG_ID" ] && [ "$EDGE_NSG_ID" != "null" ] && [ "$EDGE_NSG_ID" != "None" ] || {
  echo "phase8b_preflight=FAIL reason=edge_nsg_missing" >&2
  exit 5
}
[ -n "$APP_NSG_ID" ] && [ "$APP_NSG_ID" != "null" ] && [ "$APP_NSG_ID" != "None" ] || {
  echo "phase8b_preflight=FAIL reason=app_nsg_missing" >&2
  exit 5
}

EDGE_RULES="$(oci network nsg rules list --nsg-id "$EDGE_NSG_ID" --all --output json)"
APP_RULES="$(oci network nsg rules list --nsg-id "$APP_NSG_ID" --all --output json)"

python3 - "$APP_NSG_ID" "$EDGE_NSG_ID" "$EDGE_RULES" "$APP_RULES" <<'PY'
import json,sys
app_nsg,edge_nsg,edge_raw,app_raw=sys.argv[1:]
edge=json.loads(edge_raw).get("data",[])
app=json.loads(app_raw).get("data",[])

def port_range(rule):
    opts=rule.get("tcp-options") or {}
    rng=opts.get("destination-port-range") or {}
    return rng.get("min"),rng.get("max")

edge_ok=False
for r in edge:
    lo,hi=port_range(r)
    if (r.get("direction")=="EGRESS" and r.get("protocol")=="6" and
        r.get("destination-type")=="NETWORK_SECURITY_GROUP" and
        r.get("destination")==app_nsg and lo is not None and hi is not None and
        lo <= 3100 <= hi and lo <= 3200 <= hi):
        edge_ok=True
        break

app_ok=False
for r in app:
    lo,hi=port_range(r)
    if (r.get("direction")=="INGRESS" and r.get("protocol")=="6" and
        r.get("source-type")=="NETWORK_SECURITY_GROUP" and
        r.get("source")==edge_nsg and lo is not None and hi is not None and
        lo <= 3100 <= hi and lo <= 3200 <= hi):
        app_ok=True
        break

print(f"edge_to_app_3100_3200={'true' if edge_ok else 'false'}")
print(f"app_from_edge_3100_3200={'true' if app_ok else 'false'}")
if not (edge_ok and app_ok):
    raise SystemExit(20)
PY

SCRIPT_TEXT='set -Eeuo pipefail
echo "run_as_user=$(id -un)"
systemctl is-active --quiet teswa-api || { echo "core_runtime=FAIL reason=api_inactive"; exit 10; }
systemctl is-active --quiet teswa-realtime || { echo "core_runtime=FAIL reason=realtime_inactive"; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo "core_runtime=FAIL reason=postgres_inactive"; exit 12; }
api_listener=$(ss -ltnH | awk "$4 == \"127.0.0.1:3100\" {print \"true\"}" | head -n1)
realtime_listener=$(ss -ltnH | awk "$4 == \"127.0.0.1:3200\" {print \"true\"}" | head -n1)
[ "$api_listener" = true ] || { echo "core_runtime=FAIL reason=api_not_loopback_3100"; exit 13; }
[ "$realtime_listener" = true ] || { echo "core_runtime=FAIL reason=realtime_not_loopback_3200"; exit 14; }
if ss -ltnH | awk "$4 ~ /(^|:)3100$/ && $4 != \"127.0.0.1:3100\" {bad=1} END {exit bad ? 0 : 1}"; then echo "core_runtime=FAIL reason=unexpected_api_listener"; exit 15; fi
if ss -ltnH | awk "$4 ~ /(^|:)3200$/ && $4 != \"127.0.0.1:3200\" {bad=1} END {exit bad ? 0 : 1}"; then echo "core_runtime=FAIL reason=unexpected_realtime_listener"; exit 16; fi
fw_3100=false
fw_3200=false
if systemctl is-active --quiet firewalld; then
  sudo -n firewall-cmd --quiet --query-port=3100/tcp && fw_3100=true || true
  sudo -n firewall-cmd --quiet --query-port=3200/tcp && fw_3200=true || true
fi
echo "api_listener=127.0.0.1:3100"
echo "realtime_listener=127.0.0.1:3200"
echo "firewalld_global_3100=$fw_3100"
echo "firewalld_global_3200=$fw_3200"
echo "postgres_listener_change=none"
echo "core_runtime_preflight=PASS"'

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
  --timeout-in-seconds 60 \
  --display-name teswa-phase8b-core-routing-preflight \
  --query 'data.id' \
  --raw-output)"

elapsed=0
while true; do
  EXEC_JSON="$(oci instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$CORE_ID" --output json)"
  STATE="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("lifecycle-state",""))')"
  DELIVERY="$(printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("data",{}).get("delivery-state",""))')"
  echo "core_probe_state=$STATE delivery=$DELIVERY elapsed_seconds=$elapsed"
  if [ "$STATE" = "SUCCEEDED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}
print("exit_code=%s" % c.get("exit-code")); print((c.get("text") or "").rstrip())
if c.get("exit-code") not in (0,None): raise SystemExit(30)
'
    break
  fi
  if [ "$STATE" = "FAILED" ] || [ "$STATE" = "TIMED_OUT" ] || [ "$STATE" = "CANCELED" ]; then
    printf '%s' "$EXEC_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin).get("data",{}); c=d.get("content") or {}; print((c.get("text") or c.get("message") or "").rstrip())'
    echo "phase8b_preflight=FAIL reason=core_probe_$STATE"
    exit 6
  fi
  if [ "$elapsed" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "phase8b_preflight=FAIL reason=core_probe_timeout state=$STATE delivery=$DELIVERY"
    exit 7
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

echo "edge_private_ip=$EDGE_PRIVATE_IP"
echo "core_private_ip=$CORE_PRIVATE_IP"
echo "target_ports=3100,3200"
echo "postgres_5432_change=none"
echo "public_listener_change=none"
echo "dns_change=none"
echo "production_cutover=none"
echo "phase8b_preflight=PASS"
