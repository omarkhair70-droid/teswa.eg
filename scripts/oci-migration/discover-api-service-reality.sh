#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
CONTENT="$WORK/content.json"
TARGET="$WORK/target.json"

timeout 30s oci search resource structured-search --query-text "query instance resources where displayName = 'teswa-core-01'" --query 'data.items[0].identifier' --raw-output >"$WORK/iid"
INSTANCE_ID="$(cat "$WORK/iid")"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != null ] || { echo 'api_service_discovery=FAIL reason=core_instance_not_found'; exit 2; }
echo 'progress=read_instance'
COMPARTMENT="$(timeout 30s oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."compartment-id"' --raw-output)"
STATE="$(timeout 30s oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."lifecycle-state"' --raw-output)"
[ "$STATE" = RUNNING ] || { echo "api_service_discovery=FAIL reason=target_state value=$STATE"; exit 3; }

echo 'progress=prepare_guest_probe'
SCRIPT_TEXT="$(cat <<'GUEST'
set -Eeuo pipefail
sudo -n true || { echo 'api_service_guest=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'api_service_guest=FAIL reason=unexpected_hostname'; exit 11; }
echo 'TESWA OCI API SERVICE REALITY'
echo 'mutation=none'
echo 'supabase_mutation=none'
echo 'production_cutover=none'

UNIT=teswa-api.service
systemctl list-unit-files "$UNIT" --no-legend 2>/dev/null | grep -q "^$UNIT" || { echo 'api_service_guest=FAIL reason=unit_missing'; exit 12; }

echo '[unit_state]'
systemctl show "$UNIT" -p ActiveState -p SubState -p FragmentPath -p MainPID -p User -p Group -p WorkingDirectory -p ExecStart --no-pager

echo '[safe_unit_directives]'
FRAG="$(systemctl show "$UNIT" -p FragmentPath --value)"
if [ -r "$FRAG" ]; then
  sudo awk -F= '/^(User|Group|WorkingDirectory|ExecStart|EnvironmentFile)=/ {print $1"="$2}' "$FRAG"
fi

echo '[process_reality]'
PID="$(systemctl show "$UNIT" -p MainPID --value)"
if [ -n "$PID" ] && [ "$PID" != 0 ]; then
  echo "main_pid=$PID"
  echo "exe=$(sudo readlink -f /proc/$PID/exe 2>/dev/null || true)"
  echo "cwd=$(sudo readlink -f /proc/$PID/cwd 2>/dev/null || true)"
fi

echo '[listener_3100]'
sudo ss -lntp | awk 'NR==1 || $4 ~ /:3100$/'

echo '[http_probe_3100]'
python3 - <<'PY'
import json, urllib.error, urllib.request
for path in ('/healthz','/health','/','/v1/health'):
    url='http://127.0.0.1:3100'+path
    try:
        with urllib.request.urlopen(url,timeout=2) as r:
            body=r.read(1024).decode('utf-8','replace')
            try:
                data=json.loads(body)
                safe={k:data.get(k) for k in ('status','service','mode','productionTraffic','supabaseRuntimeDependency') if k in data}
                print(f'probe path={path} code={r.status} json={json.dumps(safe,separators=(",",":"))}')
            except Exception:
                print(f'probe path={path} code={r.status} body_non_json=true')
    except urllib.error.HTTPError as e:
        print(f'probe path={path} code={e.code}')
    except Exception as e:
        print(f'probe path={path} reachable=false error={type(e).__name__}')
PY

echo '[firewall_3100]'
if systemctl is-active --quiet firewalld; then
  echo 'firewalld_active=true'
  sudo firewall-cmd --list-ports 2>/dev/null | tr ' ' '\n' | grep -E '^(3100|80|443)/' || true
else
  echo 'firewalld_active=false'
fi

echo 'api_service_guest_discovery=PASS'
GUEST
)"
BYTES="$(printf '%s' "$SCRIPT_TEXT" | wc -c | tr -d ' ')"
echo "guest_script_bytes=$BYTES"
[ "$BYTES" -le 4096 ] || { echo 'api_service_discovery=FAIL reason=run_command_text_limit'; exit 4; }
python3 - "$CONTENT" "$SCRIPT_TEXT" <<'PY'
import json,sys
json.dump({'source':{'sourceType':'TEXT','text':sys.argv[2]},'output':{'outputType':'TEXT'}},open(sys.argv[1],'w'))
PY
python3 - "$TARGET" "$INSTANCE_ID" <<'PY'
import json,sys
json.dump({'instanceId':sys.argv[2]},open(sys.argv[1],'w'))
PY

echo 'progress=submit_run_command'
CID="$(timeout 30s oci instance-agent command create --compartment-id "$COMPARTMENT" --content "file://$CONTENT" --target "file://$TARGET" --timeout-in-seconds 120 --display-name 'teswa-api-service-reality-discovery' --query 'data.id' --raw-output)"
echo "command_id=$CID"
echo 'progress=wait_run_command'
DEADLINE=$((SECONDS+150))
while true; do
  [ "$SECONDS" -lt "$DEADLINE" ] || { echo 'api_service_discovery=FAIL reason=cloudshell_poll_timeout'; exit 5; }
  J="$(timeout 30s oci instance-agent command-execution get --command-id "$CID" --instance-id "$INSTANCE_ID" --output json)"
  S="$(printf '%s' "$J" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["lifecycle-state"])')"
  echo "state=$S"
  case "$S" in
    SUCCEEDED|FAILED|TIMED_OUT|CANCELED)
      printf '%s' "$J" | python3 -c 'import json,sys;c=json.load(sys.stdin)["data"].get("content") or {};print(c.get("text",""));print(c.get("message",""))'
      [ "$S" = SUCCEEDED ] || exit 6
      break;;
  esac
  sleep 3
done

echo 'api_service_discovery_cloudshell=PASS'
