#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
STAGE="${1:?stage directory required}"
[ "$(hostname -s)" = core01 ] || { echo 'auth_gateway=FAIL wrong_host'; exit 10; }
sudo -n true
systemctl is-active --quiet teswa-api
systemctl is-active --quiet teswa-auth-shadow
UNIT=/etc/systemd/system/teswa-api.service
APP=/opt/teswa/api-shell
SERVER="$APP/shadow_gateway.py"
[ "$(systemctl show teswa-api -p FragmentPath --value)" = "$UNIT" ]
[ -z "$(systemctl show teswa-api -p DropInPaths --value)" ]
sudo test -f /etc/teswa/phase5-api-shell-owned
BACKUP="$(sudo mktemp -d /var/lib/teswa-auth-gateway-backup.XXXXXXXX)"
sudo cp -p "$UNIT" "$BACKUP/teswa-api.service"
if sudo test -f "$SERVER"; then sudo cp -p "$SERVER" "$BACKUP/shadow_gateway.py"; fi
ROLLBACK=true
finish() {
  if [ "$ROLLBACK" = true ]; then
    sudo cp -p "$BACKUP/teswa-api.service" "$UNIT"
    if sudo test -f "$BACKUP/shadow_gateway.py"; then sudo cp -p "$BACKUP/shadow_gateway.py" "$SERVER"; fi
    sudo systemctl daemon-reload
    sudo systemctl restart teswa-api
    echo 'auth_gateway_rollback=restored_previous_service'
  fi
}
trap finish EXIT
sudo python3 - "$UNIT" "$STAGE/new-unit" <<'PY'
import ipaddress,pathlib,re,sys
text=pathlib.Path(sys.argv[1]).read_text()
assert '--network host' in text and '--read-only' in text and '-v /opt/teswa/api-shell:/srv:ro,Z' in text
match=re.search(r'--bind (\d+\.\d+\.\d+\.\d+)',text)
assert match and ipaddress.ip_address(match[1]).is_private and not ipaddress.ip_address(match[1]).is_unspecified
old='/usr/local/bin/python -m http.server 3100'
new='/usr/local/bin/python /srv/shadow_gateway.py 3100'
assert text.count(old)==1 or text.count(new)==1, 'Unexpected existing API implementation'
pathlib.Path(sys.argv[2]).write_text(text.replace(old,new))
PY
sudo install -o root -g root -m 0644 "$STAGE/auth-api-shadow-gateway.py" "$SERVER"
sudo restorecon "$SERVER" 2>/dev/null || true
sudo install -o root -g root -m 0644 "$STAGE/new-unit" "$UNIT"
sudo systemctl daemon-reload
sudo systemctl restart teswa-api
BIND="$(sudo sed -n 's/.*--bind \([0-9.]*\).*/\1/p' "$UNIT")"
READY=false
for _ in $(seq 1 15); do
  if curl --noproxy '*' --max-time 5 -fsS "http://$BIND:3100/healthz" > "$STAGE/health.json" 2>/dev/null; then READY=true; break; fi
  sleep 1
done
[ "$READY" = true ]
python3 - "$BIND" <<'PY'
import json,sys,urllib.request,urllib.error
base='http://'+sys.argv[1]+':3100'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(base+'/healthz',timeout=5) as r:
 data=json.load(r); assert data['status']=='ok' and data['productionTraffic'] is False
with opener.open(base+'/v1/auth/healthz',timeout=5) as r:
 data=json.load(r); assert data['durableSessions'] is True and data['productionTraffic'] is False
for path,body,expected in [('/v1/auth/session',None,401),('/v1/auth/google',b'{"id_token":"invalid"}',401),('/v1/auth/sign-up',b'{}',503),('/unknown',None,404)]:
 req=urllib.request.Request(base+path,data=body,headers={'Content-Type':'application/json'})
 try: opener.open(req,timeout=5); raise AssertionError('Unexpected success')
 except urllib.error.HTTPError as e: assert e.code==expected,(path,e.code)
print('private_api_auth_routes=PASS')
print('unauthorized_and_unconfigured_routes=PASS')
PY
systemctl is-active --quiet teswa-api
ROLLBACK=false
echo "rollback_backup=$BACKUP"
echo 'auth_gateway=PASS production_traffic=false database_mutation=none'
