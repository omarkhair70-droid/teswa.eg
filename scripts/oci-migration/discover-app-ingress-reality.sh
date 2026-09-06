#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CONTENT="$WORK/content.json"
TARGET="$WORK/target.json"

INSTANCE_ID="$(oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'ingress_discovery=FAIL reason=core_instance_not_found'; exit 2; }
COMPARTMENT="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
STATE="$(oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo "ingress_discovery=FAIL reason=target_state value=$STATE"; exit 3; }

VNIC_ID="$(oci compute instance list-vnics --instance-id "$INSTANCE_ID" --query 'data[0].id' --raw-output)"
PRIVATE_IP="$(oci network vnic get --vnic-id "$VNIC_ID" --query 'data."private-ip"' --raw-output)"
PUBLIC_IP="$(oci network vnic get --vnic-id "$VNIC_ID" --query 'data."public-ip"' --raw-output)"
SUBNET_ID="$(oci network vnic get --vnic-id "$VNIC_ID" --query 'data."subnet-id"' --raw-output)"
NSGS="$(oci network vnic get --vnic-id "$VNIC_ID" --query 'data."nsg-ids"' --raw-output 2>/dev/null || true)"

echo 'TESWA OCI APP INGRESS REALITY DISCOVERY'
echo 'mutation=none'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo "instance_state=$STATE"
echo "private_ip=$PRIVATE_IP"
echo "public_ip=${PUBLIC_IP:-null}"
echo "subnet_id=$SUBNET_ID"
echo "nsg_ids=${NSGS:-[]}" 

SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
sudo -n true || { echo 'ingress_guest=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'ingress_guest=FAIL reason=unexpected_hostname'; exit 11; }
echo 'guest_hostname=core01'
echo 'guest_mutation=none'

echo '[relevant_listeners]'
sudo ss -lntp | awk 'NR==1 || $4 ~ /:(80|443|3100|3110|8080|8443)$/'

echo '[relevant_services]'
systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '$1 ~ /(teswa|nginx|caddy|httpd|apache)/ {print $1,$3,$4}' || true

echo '[service_states]'
for u in teswa-auth-shadow.service teswa-auth.service teswa-api-shell.service teswa-api.service nginx.service caddy.service httpd.service; do
  if systemctl list-unit-files "$u" --no-legend 2>/dev/null | grep -q "^$u"; then
    A="$(systemctl is-active "$u" 2>/dev/null || true)"; E="$(systemctl is-enabled "$u" 2>/dev/null || true)"
    echo "unit=$u active=$A enabled=$E"
  fi
done

echo '[server_binaries]'
for b in nginx caddy httpd apache2; do command -v "$b" >/dev/null 2>&1 && echo "binary=$b present=true" || true; done

echo '[loopback_health]'
python3 - <<'PY'
import json, urllib.request, urllib.error
for port,path in [(3110,'/healthz'),(3100,'/healthz'),(3100,'/health'),(8080,'/healthz')]:
    url=f'http://127.0.0.1:{port}{path}'
    try:
        with urllib.request.urlopen(url,timeout=1.5) as r:
            body=r.read(4096).decode('utf-8','replace')
            try:
                data=json.loads(body)
                safe={k:data.get(k) for k in ('status','service','mode','productionTraffic','supabaseRuntimeDependency') if k in data}
                print(f'health port={port} path={path} code={r.status} json={json.dumps(safe,separators=(",",":"))}')
            except Exception:
                print(f'health port={port} path={path} code={r.status} body_non_json=true')
    except Exception as e:
        print(f'health port={port} path={path} reachable=false error={type(e).__name__}')
PY

echo '[firewall]'
if systemctl is-active --quiet firewalld; then
  echo 'firewalld_active=true'
  echo "firewall_services=$(sudo firewall-cmd --list-services 2>/dev/null || true)"
  echo "firewall_ports=$(sudo firewall-cmd --list-ports 2>/dev/null || true)"
else
  echo 'firewalld_active=false'
fi

echo 'ingress_guest_discovery=PASS'
GUEST
)"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'ingress_discovery=FAIL reason=run_command_text_limit'; exit 4; }
python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY
CID="$(oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 180 --display-name 'teswa-app-ingress-reality-discovery' --query 'data.id' --raw-output)"
echo "command_id=$CID"
while true; do
  J="$(oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'
      [ "$S" = SUCCEEDED ] || exit 5
      break;;
  esac
  sleep 3
done

echo 'ingress_discovery_cloudshell=PASS'
