#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage directory required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal
APP=/opt/teswa/auth-shadow
UNIT=/etc/systemd/system/teswa-auth-shadow.service
MARK=/etc/teswa/lane4-auth-google-shadow-owned
SECRET=/etc/teswa/auth-shadow-session.key
IDENTITY="$APP/identity-map.json"
CONFIG="$APP/config.json"

sudo -n true || { echo 'auth_session_foundation=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'auth_session_foundation=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'auth_session_foundation=FAIL reason=postgres_inactive'; exit 12; }
for f in "$STAGE/runtime-auth-session-foundation.sql" "$STAGE/auth-session-shadow-server.py"; do
  [ -f "$f" ] || { echo "auth_session_foundation=FAIL reason=missing_artifact file=$f"; exit 13; }
done
for f in "$IDENTITY" "$CONFIG" "$SECRET" "$UNIT" "$MARK"; do
  sudo test -e "$f" || { echo "auth_session_foundation=FAIL reason=existing_shadow_asset_missing path=$f"; exit 14; }
done

FNBAD="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND (pg_get_functiondef(p.oid) LIKE '%auth.uid()%' OR pg_get_functiondef(p.oid) LIKE '%auth.role()%')")"
POLBAD="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%' OR coalesce(qual,'') LIKE '%auth.role()%' OR coalesce(with_check,'') LIKE '%auth.role()%')")"
[ "$FNBAD" = 0 ] && [ "$POLBAD" = 0 ] || { echo "auth_session_foundation=FAIL reason=database_runtime_not_closed functions=$FNBAD policies=$POLBAD"; exit 15; }
echo 'database_runtime_auth_dependency=ZERO'

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-auth-session-foundation.sql"
echo 'auth_session_schema_apply=PASS'

ROLE_OK="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_roles WHERE rolname='teswaauth' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls")"
[ "$ROLE_OK" = 1 ] || { echo 'auth_session_foundation=FAIL reason=teswaauth_role_guard'; exit 16; }
DIRECT="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT has_table_privilege('teswaauth','teswa_auth.sessions','SELECT') OR has_table_privilege('teswaauth','teswa_auth.sessions','INSERT') OR has_table_privilege('teswaauth','teswa_auth.sessions','UPDATE') OR has_table_privilege('teswaauth','teswa_auth.sessions','DELETE')")"
[ "$DIRECT" = f ] || { echo 'auth_session_foundation=FAIL reason=direct_session_table_grant'; exit 17; }
PEER="$(sudo -u teswaauth "$P" -X -qAt -v ON_ERROR_STOP=1 -d "$DB" -c 'SELECT teswa_auth.active_session_count() >= 0')"
[ "$PEER" = t ] || { echo 'auth_session_foundation=FAIL reason=teswaauth_peer_function_access'; exit 18; }
echo 'auth_session_database_auth=unix_peer_no_password'
echo 'auth_session_direct_table_access=false'

# The persistent auth-shadow assets are intentionally root:teswaauth 0640.
# Read config as the service principal, not as the Run Command user. Also make
# only the temporary stage directory/server source traversable/readable for the
# same principal during the self-test; the stage is removed by the operator.
chmod 0755 "$STAGE"
chmod 0644 "$STAGE/auth-session-shadow-server.py"
CLIENT_ID="$(sudo -u teswaauth python3 - "$CONFIG" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); v=x.get('google_web_client_id')
assert isinstance(v,str) and v.endswith('.apps.googleusercontent.com')
print(v)
PY
)"
[ -n "$CLIENT_ID" ] || { echo 'auth_session_foundation=FAIL reason=google_client_missing'; exit 19; }

sudo -u teswaauth python3 "$STAGE/auth-session-shadow-server.py" \
  --identity-map "$IDENTITY" --google-client-id "$CLIENT_ID" --session-secret "$SECRET" --self-test

echo 'auth_session_self_test_complete=PASS'

sudo systemctl stop teswa-auth-shadow
sudo install -o root -g teswaauth -m 0640 "$STAGE/auth-session-shadow-server.py" "$APP/server.py"
TMP="$(mktemp)"
cat > "$TMP" <<EOF
[Unit]
Description=Teswa durable auth shadow runtime
After=network-online.target postgresql-17.service
Wants=network-online.target
Requires=postgresql-17.service

[Service]
Type=simple
User=teswaauth
Group=teswaauth
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $APP/server.py --bind 127.0.0.1 --port 3110 --identity-map $IDENTITY --google-client-id $CLIENT_ID --session-secret $SECRET
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
sudo install -o root -g root -m 0644 "$TMP" "$UNIT"; rm -f "$TMP"
sudo systemctl daemon-reload
sudo systemctl enable --now teswa-auth-shadow >/dev/null

BODY=''
for _ in $(seq 1 20); do
  BODY="$(curl -fsS http://127.0.0.1:3110/healthz 2>/dev/null || true)"
  [ -n "$BODY" ] && break
  sleep 1
done
[ -n "$BODY" ] || { echo 'auth_session_foundation=FAIL reason=health_timeout'; sudo journalctl -u teswa-auth-shadow -n 40 --no-pager || true; exit 20; }
printf '%s' "$BODY" | python3 -c '
import json,sys
x=json.load(sys.stdin)
assert x["status"]=="ok" and x["service"]=="teswa-auth-shadow"
assert x["mode"]=="google-direct-durable-shadow"
assert x["durableSessions"] is True and x["refreshRotation"] is True
assert x["productionTraffic"] is False and x["supabaseRuntimeDependency"] is False
assert x["identityUsers"]==32 and x["identityMappings"]==32
assert x["accessTtlSeconds"]==900 and x["refreshTtlSeconds"]==2592000
'

a="$(curl -sS -o /tmp/teswa-auth-neg-session.json -w '%{http_code}' -H 'Authorization: Bearer invalid' http://127.0.0.1:3110/v1/auth/session)"
r="$(curl -sS -o /tmp/teswa-auth-neg-refresh.json -w '%{http_code}' -H 'Content-Type: application/json' --data '{"refresh_token":"invalid-invalid-invalid-invalid-invalid"}' http://127.0.0.1:3110/v1/auth/refresh)"
g="$(curl -sS -o /tmp/teswa-auth-neg-google.json -w '%{http_code}' -H 'Content-Type: application/json' --data '{"id_token":"invalid.invalid.invalid"}' http://127.0.0.1:3110/v1/auth/google)"
rm -f /tmp/teswa-auth-neg-session.json /tmp/teswa-auth-neg-refresh.json /tmp/teswa-auth-neg-google.json
[ "$a" = 401 ] && [ "$r" = 401 ] && [ "$g" = 401 ] || { echo "auth_session_foundation=FAIL reason=negative_http access=$a refresh=$r google=$g"; exit 21; }

systemctl is-active --quiet teswa-auth-shadow || { echo 'auth_session_foundation=FAIL reason=service_inactive'; exit 22; }
systemctl is-enabled --quiet teswa-auth-shadow || { echo 'auth_session_foundation=FAIL reason=service_disabled'; exit 23; }
ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3110[[:space:]]' || { echo 'auth_session_foundation=FAIL reason=local_listener_missing'; exit 24; }
if ss -ltnH | grep -Eq '[[:space:]](0\.0\.0\.0|\[::\]|\*):3110[[:space:]]'; then echo 'auth_session_foundation=FAIL reason=public_listener'; exit 25; fi
if systemctl is-active --quiet firewalld && sudo firewall-cmd --quiet --query-port=3110/tcp; then echo 'auth_session_foundation=FAIL reason=firewall_open'; exit 26; fi

STAGED_SHA="$(sha256sum "$STAGE/auth-session-shadow-server.py" | awk '{print $1}')"
INSTALLED_SHA="$(sudo sha256sum "$APP/server.py" | awk '{print $1}')"
[ "$STAGED_SHA" = "$INSTALLED_SHA" ] || { echo 'auth_session_foundation=FAIL reason=server_sha_mismatch'; exit 27; }

printf '%s\n' \
  'service_active=true' \
  'service_enabled=true' \
  'listen_address=127.0.0.1' \
  'port=3110' \
  'firewall_3110_open=false' \
  'durable_sessions=true' \
  'access_token_ttl_seconds=900' \
  'refresh_token_ttl_seconds=2592000' \
  'refresh_token_storage=sha256_only' \
  'negative_access_test=PASS' \
  'negative_refresh_test=PASS' \
  'negative_google_test=PASS' \
  "server_sha256=$INSTALLED_SHA" \
  'supabase_runtime_dependency=false' \
  'supabase_mutation=none' \
  'production_cutover=none' \
  'app_traffic_switch=none' \
  'positive_google_token_verified=false' \
  'auth_session_foundation=PASS'
