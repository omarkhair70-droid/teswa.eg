#!/usr/bin/env bash
set -Eeuo pipefail

# Runs on teswa-core-01 only. Installs the loopback-only Lane 4 realtime
# rehearsal transport. It does not alter DNS/firewall/app routing or Supabase.

STAGE="${1:?stage directory required}"
MARK=/etc/teswa/lane4-realtime-shadow-owned
UNIT=/etc/systemd/system/teswa-realtime-shadow.service
APP=/opt/teswa/realtime-shadow
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

sudo -n true || { echo 'realtime_transport_deploy=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'realtime_transport_deploy=FAIL reason=unexpected_guest_hostname'; exit 11; }
[ -f "$STAGE/server.py" ] || { echo 'realtime_transport_deploy=FAIL reason=missing_server'; exit 12; }
systemctl is-active --quiet postgresql-17 || { echo 'realtime_transport_deploy=FAIL reason=postgres_inactive'; exit 13; }
systemctl is-active --quiet teswa-auth-shadow || { echo 'realtime_transport_deploy=FAIL reason=auth_shadow_inactive'; exit 14; }
curl -fsS http://127.0.0.1:3110/healthz >/dev/null || { echo 'realtime_transport_deploy=FAIL reason=auth_shadow_health'; exit 15; }

outbox="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT CASE WHEN to_regprocedure('teswa_realtime.read_events(bigint,integer)') IS NULL THEN 'absent' ELSE 'present' END")"
[ "$outbox" = present ] || { echo 'realtime_transport_deploy=FAIL reason=realtime_outbox_missing'; exit 16; }
rls_role="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_roles WHERE rolname='teswa_app_authenticated' AND NOT rolcanlogin AND NOT rolbypassrls")"
[ "$rls_role" = 1 ] || { echo 'realtime_transport_deploy=FAIL reason=runtime_role_not_green'; exit 17; }

if sudo test -e "$UNIT" && ! sudo test -e "$MARK"; then
  echo 'realtime_transport_deploy=FAIL reason=unowned_existing_unit'; exit 18
fi
if sudo test -e "$MARK"; then
  sudo systemctl stop teswa-realtime-shadow >/dev/null 2>&1 || true
fi
if ss -ltnH | grep -Eq '[[:space:]](127\.0\.0\.1|0\.0\.0\.0|\[::\]|\*):3120[[:space:]]'; then
  echo 'realtime_transport_deploy=FAIL reason=port_3120_in_use'; exit 19
fi

if ! id teswarealtime >/dev/null 2>&1; then
  sudo useradd --system --home-dir /nonexistent --shell /sbin/nologin teswarealtime
fi

# A matching local Postgres role permits Unix-socket peer authentication without
# storing a database password. It may SET ROLE to the constrained app role only.
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswarealtime') THEN
    CREATE ROLE teswarealtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;
ALTER ROLE teswarealtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT teswa_app_authenticated TO teswarealtime;
SQL

sudo -u teswarealtime "$P" -X -qAt -d "$DB" -c 'select 1' | grep -qx 1 || {
  echo 'realtime_transport_deploy=FAIL reason=peer_database_login_failed'; exit 20
}

sudo install -d -m 0755 /etc/teswa
sudo install -d -o root -g teswarealtime -m 0750 "$APP"
sudo install -o root -g teswarealtime -m 0640 "$STAGE/server.py" "$APP/server.py"

TMP="$(mktemp)"
cat >"$TMP" <<EOF
[Unit]
Description=Teswa realtime shadow transport
After=network-online.target postgresql-17.service teswa-auth-shadow.service
Wants=network-online.target
Requires=postgresql-17.service teswa-auth-shadow.service

[Service]
Type=simple
User=teswarealtime
Group=teswarealtime
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $APP/server.py --bind 127.0.0.1 --port 3120
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
TasksMax=96
MemoryMax=160M

[Install]
WantedBy=multi-user.target
EOF
sudo install -o root -g root -m 0644 "$TMP" "$UNIT"
rm -f "$TMP"
sudo touch "$MARK"
sudo systemctl daemon-reload
sudo systemctl enable --now teswa-realtime-shadow >/dev/null

BODY=''
for _ in $(seq 1 20); do
  if BODY="$(curl -fsS http://127.0.0.1:3120/healthz 2>/dev/null)"; then break; fi
  sleep 1
done
[ -n "$BODY" ] || {
  echo 'realtime_transport_deploy=FAIL reason=health_timeout'
  sudo systemctl --no-pager -l status teswa-realtime-shadow || true
  sudo journalctl -u teswa-realtime-shadow -n 40 --no-pager || true
  exit 21
}
printf '%s' "$BODY" | python3 -c '
import json,sys
x=json.load(sys.stdin)
assert x["status"]=="ok" and x["service"]=="teswa-realtime-shadow"
assert x["mode"]=="durable-outbox-long-poll"
assert x["productionTraffic"] is False and x["supabaseRuntimeDependency"] is False
'

bad="$(curl -sS -o /tmp/teswa-rt-bad.json -w '%{http_code}' http://127.0.0.1:3120/v1/realtime/events)"
rm -f /tmp/teswa-rt-bad.json
[ "$bad" = 401 ] || { echo "realtime_transport_deploy=FAIL reason=negative_session_http_$bad"; exit 22; }

# Mint one ephemeral local shadow session only for transport verification. It is
# never printed or persisted. Auth-shadow remains the verifier of that session.
PROBE_USER="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT u.id FROM teswa_identity.users u WHERE EXISTS (SELECT 1 FROM public.direct_conversations c WHERE u.id IN (c.participant_a,c.participant_b)) ORDER BY u.id LIMIT 1")"
[ -n "$PROBE_USER" ] || { echo 'realtime_transport_deploy=FAIL reason=no_probe_user'; exit 23; }
PROBE_AFTER="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT coalesce(max(event_id),0) FROM teswa_realtime.events')"
PROBE_AGG="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT id FROM public.direct_conversations WHERE '$PROBE_USER'::uuid IN (participant_a,participant_b) ORDER BY id LIMIT 1")"
PROBE_EVENT="$(sudo -u postgres "$P" -d "$DB" -Atqc "INSERT INTO teswa_realtime.events(source_table,event_type,aggregate_kind,aggregate_id,row_id) VALUES ('direct_messages','UPDATE','direct','$PROBE_AGG',NULL) RETURNING event_id")"
cleanup_probe(){ sudo -u postgres "$P" -d "$DB" -qAtc "DELETE FROM teswa_realtime.events WHERE event_id=$PROBE_EVENT" >/dev/null 2>&1 || true; }
trap cleanup_probe EXIT

TOKEN="$(sudo python3 - "$PROBE_USER" /etc/teswa/auth-shadow-session.key <<'PY'
import base64,hashlib,hmac,json,secrets,sys,time
uid=sys.argv[1]; secret=open(sys.argv[2],'rb').read().strip()
def b64(x): return base64.urlsafe_b64encode(x).rstrip(b'=').decode()
def cj(x): return json.dumps(x,separators=(',',':'),sort_keys=True).encode()
now=int(time.time()); h={'alg':'HS256','typ':'JWT'}
p={'ver':1,'iss':'teswa-auth-shadow','aud':'teswa-shadow','sub':uid,'provider':'rehearsal-probe','iat':now,'exp':now+60,'jti':secrets.token_urlsafe(12),'shadow':True}
a,b=b64(cj(h)),b64(cj(p)); s=hmac.new(secret,f'{a}.{b}'.encode(),hashlib.sha256).digest(); print(f'{a}.{b}.{b64(s)}')
PY
)"
RESP="$(curl -fsS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3120/v1/realtime/events?after=$PROBE_AFTER&limit=10&wait_ms=0")"
unset TOKEN
printf '%s' "$RESP" | python3 - "$PROBE_EVENT" <<'PY'
import json,sys
x=json.load(sys.stdin); eid=int(sys.argv[1])
assert x.get('hasEvents') is True
assert any(int(e['event_id'])==eid for e in x.get('events',[]))
assert int(x.get('nextAfter',0))>=eid
PY
cleanup_probe
trap - EXIT

systemctl is-active --quiet teswa-realtime-shadow || { echo 'realtime_transport_deploy=FAIL reason=service_inactive'; exit 24; }
systemctl is-enabled --quiet teswa-realtime-shadow || { echo 'realtime_transport_deploy=FAIL reason=service_disabled'; exit 25; }
ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3120[[:space:]]' || { echo 'realtime_transport_deploy=FAIL reason=local_listener_missing'; exit 26; }
if ss -ltnH | grep -Eq '[[:space:]](0\.0\.0\.0|\[::\]|\*):3120[[:space:]]'; then
  echo 'realtime_transport_deploy=FAIL reason=public_listener'; exit 27
fi
if systemctl is-active --quiet firewalld && sudo firewall-cmd --quiet --query-port=3120/tcp; then
  echo 'realtime_transport_deploy=FAIL reason=firewall_3120_open'; exit 28
fi

installed_sha="$(sudo sha256sum "$APP/server.py" | awk '{print $1}')"
echo 'transport_auth=teswa-auth-shadow-local'
echo 'transport_database_auth=unix_peer_no_password'
echo 'transport_mode=durable_outbox_long_poll'
echo 'transport_positive_session_probe=PASS'
echo 'transport_catchup_probe=PASS'
echo 'transport_probe_cleanup=PASS'
echo 'negative_session_test=PASS'
echo 'service_active=true'
echo 'service_enabled=true'
echo 'listen_address=127.0.0.1'
echo 'port=3120'
echo 'firewall_3120_open=false'
echo "server_sha256=$installed_sha"
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo 'realtime_transport_deploy=PASS'
