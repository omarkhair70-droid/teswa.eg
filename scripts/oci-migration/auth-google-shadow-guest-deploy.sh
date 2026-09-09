#!/usr/bin/env bash
set -Eeuo pipefail

# Runs only on teswa-core-01 through OCI Run Command. Installs a private,
# loopback-only Google auth shadow service. It does not modify PostgreSQL,
# Supabase, teswa-api, DNS, firewall rules, or production routing.

STAGE="${1:?stage directory required}"
MARK=/etc/teswa/lane4-auth-google-shadow-owned
UNIT=/etc/systemd/system/teswa-auth-shadow.service
APP=/opt/teswa/auth-shadow
SECRET=/etc/teswa/auth-shadow-session.key

sudo -n true || { echo 'auth_google_shadow_deploy=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'auth_google_shadow_deploy=FAIL reason=unexpected_guest_hostname'; exit 11; }
for f in "$STAGE/server.py" "$STAGE/identity-map.json" "$STAGE/config.json"; do
  [ -f "$f" ] || { echo "auth_google_shadow_deploy=FAIL reason=missing_artifact file=$f"; exit 12; }
done

read -r USERS IDENTITIES CLIENT_ID < <(python3 - "$STAGE/identity-map.json" "$STAGE/config.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); c=json.load(open(sys.argv[2]))
assert m.get('credential_material_included') is False
assert len(m.get('users') or []) == 32
assert len(m.get('identities') or []) == 32
cid=c.get('google_web_client_id')
assert isinstance(cid,str) and cid.endswith('.apps.googleusercontent.com')
print(len(m['users']),len(m['identities']),cid)
PY
)
[ "$USERS" = 32 ] && [ "$IDENTITIES" = 32 ] || { echo 'auth_google_shadow_deploy=FAIL reason=identity_count_guard'; exit 13; }

command -v python3 >/dev/null 2>&1 || { echo 'auth_google_shadow_deploy=FAIL reason=python_missing'; exit 14; }
command -v openssl >/dev/null 2>&1 || { echo 'auth_google_shadow_deploy=FAIL reason=openssl_missing'; exit 15; }

if sudo test -e "$UNIT" && ! sudo test -e "$MARK"; then
  echo 'auth_google_shadow_deploy=FAIL reason=unowned_existing_unit'; exit 16
fi
if sudo test -e "$MARK"; then
  sudo systemctl stop teswa-auth-shadow >/dev/null 2>&1 || true
fi
if ss -ltnH | grep -Eq '[[:space:]](127\.0\.0\.1|0\.0\.0\.0|\[::\]|\*):3110[[:space:]]'; then
  echo 'auth_google_shadow_deploy=FAIL reason=port_3110_in_use'; exit 17
fi

if ! id teswaauth >/dev/null 2>&1; then
  sudo useradd --system --home-dir /nonexistent --shell /sbin/nologin teswaauth
fi
sudo install -d -m 0755 /etc/teswa
sudo install -d -o root -g teswaauth -m 0750 "$APP"
sudo install -o root -g teswaauth -m 0640 "$STAGE/server.py" "$APP/server.py"
sudo install -o root -g teswaauth -m 0640 "$STAGE/identity-map.json" "$APP/identity-map.json"
sudo install -o root -g teswaauth -m 0640 "$STAGE/config.json" "$APP/config.json"
if ! sudo test -s "$SECRET"; then
  openssl rand -hex 32 | sudo tee "$SECRET" >/dev/null
fi
sudo chown root:teswaauth "$SECRET"
sudo chmod 0640 "$SECRET"

TMP="$(mktemp)"
cat >"$TMP" <<EOF
[Unit]
Description=Teswa Google auth shadow runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=teswaauth
Group=teswaauth
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $APP/server.py --bind 127.0.0.1 --port 3110 --identity-map $APP/identity-map.json --google-client-id $CLIENT_ID --session-secret $SECRET
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
CapabilityBoundingSet=
AmbientCapabilities=
UMask=0077
TasksMax=64
MemoryMax=128M

[Install]
WantedBy=multi-user.target
EOF
sudo install -o root -g root -m 0644 "$TMP" "$UNIT"
rm -f "$TMP"
sudo touch "$MARK"
sudo systemctl daemon-reload
sudo systemctl enable --now teswa-auth-shadow >/dev/null

BODY=''
for _ in $(seq 1 20); do
  if BODY="$(curl -fsS http://127.0.0.1:3110/healthz 2>/dev/null)"; then break; fi
  sleep 1
done
[ -n "$BODY" ] || {
  echo 'auth_google_shadow_deploy=FAIL reason=health_timeout'
  sudo systemctl --no-pager -l status teswa-auth-shadow || true
  sudo journalctl -u teswa-auth-shadow -n 40 --no-pager || true
  exit 18
}
printf '%s' "$BODY" | python3 -c '
import json,sys
x=json.load(sys.stdin)
assert x["status"]=="ok"
assert x["service"]=="teswa-auth-shadow"
assert x["mode"]=="google-direct-shadow"
assert x["productionTraffic"] is False
assert x["supabaseRuntimeDependency"] is False
assert x["identityUsers"]==32 and x["identityMappings"]==32
'

bad_google="$(curl -sS -o /tmp/teswa-auth-bad-google.json -w '%{http_code}' -H 'Content-Type: application/json' --data '{"id_token":"invalid.invalid.invalid"}' http://127.0.0.1:3110/v1/auth/google)"
[ "$bad_google" = 401 ] || { echo "auth_google_shadow_deploy=FAIL reason=negative_google_http_$bad_google"; exit 19; }
bad_session="$(curl -sS -o /tmp/teswa-auth-bad-session.json -w '%{http_code}' -H 'Authorization: Bearer invalid' http://127.0.0.1:3110/v1/auth/session)"
rm -f /tmp/teswa-auth-bad-google.json /tmp/teswa-auth-bad-session.json
[ "$bad_session" = 401 ] || { echo "auth_google_shadow_deploy=FAIL reason=negative_session_http_$bad_session"; exit 20; }

systemctl is-active --quiet teswa-auth-shadow || { echo 'auth_google_shadow_deploy=FAIL reason=service_inactive'; exit 21; }
systemctl is-enabled --quiet teswa-auth-shadow || { echo 'auth_google_shadow_deploy=FAIL reason=service_disabled'; exit 22; }
ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3110[[:space:]]' || { echo 'auth_google_shadow_deploy=FAIL reason=local_listener_missing'; exit 23; }
if ss -ltnH | grep -Eq '[[:space:]](0\.0\.0\.0|\[::\]|\*):3110[[:space:]]'; then
  echo 'auth_google_shadow_deploy=FAIL reason=public_listener'; exit 24
fi
if systemctl is-active --quiet firewalld && sudo firewall-cmd --quiet --query-port=3110/tcp; then
  echo 'auth_google_shadow_deploy=FAIL reason=firewall_3110_open'; exit 25
fi

server_sha="$(sha256sum "$STAGE/server.py" | awk '{print $1}')"
installed_sha="$(sudo sha256sum "$APP/server.py" | awk '{print $1}')"
[ "$server_sha" = "$installed_sha" ] || { echo 'auth_google_shadow_deploy=FAIL reason=server_sha_mismatch'; exit 26; }

echo "identity_users=$USERS"
echo "identity_mappings=$IDENTITIES"
echo "service_active=true"
echo "service_enabled=true"
echo "listen_address=127.0.0.1"
echo "port=3110"
echo "firewall_3110_open=false"
echo "google_signature_mode=direct_rs256_google_certs"
echo "shadow_session_issuer=teswa-auth-shadow"
echo "shadow_session_ttl_seconds=900"
echo "negative_google_token_test=PASS"
echo "negative_shadow_session_test=PASS"
echo "server_sha256=$installed_sha"
echo "database_mutation=none"
echo "supabase_mutation=none"
echo "teswa_api_mutation=none"
echo "production_cutover=none"
echo "positive_google_token_verified=false"
echo "auth_google_shadow_deploy=PASS"
