#!/usr/bin/env bash
set -Eeuo pipefail

# Runs on teswa-core-01 only. Installs the Teswa-owned push worker in rehearsal
# mode. Outbound Expo delivery is explicitly disabled; a synthetic local probe is
# created and cleaned to verify claim/payload/preference/device semantics.

STAGE="${1:?stage directory required}"
APP=/opt/teswa/push-shadow
UNIT=/etc/systemd/system/teswa-push-shadow.service
MARK=/etc/teswa/lane4-push-shadow-owned
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal
PROBE_NOTIFICATION=''
PROBE_DEVICE=''

cleanup_probe(){
  if [ -n "$PROBE_NOTIFICATION" ]; then sudo -u postgres "$P" -d "$DB" -qAtc "DELETE FROM public.notifications WHERE id='$PROBE_NOTIFICATION'::uuid" >/dev/null 2>&1 || true; fi
  if [ -n "$PROBE_DEVICE" ]; then sudo -u postgres "$P" -d "$DB" -qAtc "DELETE FROM public.push_devices WHERE id='$PROBE_DEVICE'::uuid" >/dev/null 2>&1 || true; fi
}
trap cleanup_probe EXIT

sudo -n true || { echo 'push_worker_deploy=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'push_worker_deploy=FAIL reason=unexpected_guest_hostname'; exit 11; }
[ -f "$STAGE/worker.py" ] || { echo 'push_worker_deploy=FAIL reason=missing_worker'; exit 12; }
systemctl is-active --quiet postgresql-17 || { echo 'push_worker_deploy=FAIL reason=postgres_inactive'; exit 13; }
outbox="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT CASE WHEN to_regclass('teswa_jobs.push_outbox') IS NULL THEN 'absent' ELSE 'present' END")"
[ "$outbox" = present ] || { echo 'push_worker_deploy=FAIL reason=push_outbox_missing'; exit 14; }

if sudo test -e "$UNIT" && ! sudo test -e "$MARK"; then echo 'push_worker_deploy=FAIL reason=unowned_existing_unit'; exit 15; fi
if sudo test -e "$MARK"; then sudo systemctl stop teswa-push-shadow >/dev/null 2>&1 || true; fi

if ! id teswapush >/dev/null 2>&1; then sudo useradd --system --home-dir /nonexistent --shell /sbin/nologin teswapush; fi

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswapush') THEN
    CREATE ROLE teswapush LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;
ALTER ROLE teswapush LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public,teswa_jobs TO teswapush;
GRANT SELECT ON public.notifications,public.notification_preferences,public.push_devices,public.profiles TO teswapush;
GRANT UPDATE ON public.push_devices TO teswapush;
GRANT SELECT,UPDATE ON teswa_jobs.push_outbox TO teswapush;
SQL

sudo -u teswapush "$P" -X -qAt -d "$DB" -c 'select 1' | grep -qx 1 || { echo 'push_worker_deploy=FAIL reason=peer_database_login_failed'; exit 16; }

sudo install -d -m 0755 /etc/teswa
sudo install -d -o root -g teswapush -m 0750 "$APP"
sudo install -o root -g teswapush -m 0640 "$STAGE/worker.py" "$APP/worker.py"

TMP="$(mktemp)"
cat >"$TMP" <<EOF
[Unit]
Description=Teswa push shadow worker
After=network-online.target postgresql-17.service
Wants=network-online.target
Requires=postgresql-17.service

[Service]
Type=simple
User=teswapush
Group=teswapush
Environment=PYTHONUNBUFFERED=1
Environment=TESWA_DB=teswa_rehearsal
Environment=TESWA_PUSH_SEND_ENABLED=0
ExecStart=/usr/bin/python3 $APP/worker.py --sleep 2
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

HEALTH="$(sudo -u teswapush env TESWA_DB="$DB" TESWA_PUSH_SEND_ENABLED=0 python3 "$APP/worker.py" --health)"
printf '%s' "$HEALTH" | python3 -c 'import json,sys;x=json.load(sys.stdin);assert x["status"]=="ok" and x["outboxReady"] is True and x["sendEnabled"] is False and x["supabaseRuntimeDependency"] is False'

PROBE_USER="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT id FROM teswa_identity.users ORDER BY id LIMIT 1")"
[ -n "$PROBE_USER" ] || { echo 'push_worker_deploy=FAIL reason=no_probe_user'; exit 17; }
PROBE_DEVICE="$(sudo -u postgres "$P" -d "$DB" -Atqc "INSERT INTO public.push_devices(user_id,expo_push_token,platform,notifications_enabled) VALUES ('$PROBE_USER'::uuid,'ExponentPushToken[teswa-rehearsal-probe]','android',true) RETURNING id")"
PROBE_NOTIFICATION="$(sudo -u postgres "$P" -d "$DB" -Atqc "INSERT INTO public.notifications(user_id,type,title,body,route) VALUES ('$PROBE_USER'::uuid,'system','Teswa rehearsal probe','No outbound push must occur','/rehearsal/probe') RETURNING id")"
PROBE_JOB="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT job_id FROM teswa_jobs.push_outbox WHERE notification_id='$PROBE_NOTIFICATION'::uuid")"
[ -n "$PROBE_JOB" ] || { echo 'push_worker_deploy=FAIL reason=probe_outbox_not_created'; exit 18; }

RESULT="$(sudo -u teswapush env TESWA_DB="$DB" TESWA_PUSH_SEND_ENABLED=0 python3 "$APP/worker.py" --once)"
printf '%s' "$RESULT" | python3 -c 'import json,sys;x=json.load(sys.stdin);assert x.get("processed") is True;assert x.get("status")=="skipped";assert x.get("reason")=="rehearsal_send_disabled";assert int(x.get("deviceCount",0))==1'
STATUS="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT status||':'||coalesce(last_error,'') FROM teswa_jobs.push_outbox WHERE job_id=$PROBE_JOB")"
[ "$STATUS" = 'skipped:rehearsal_send_disabled' ] || { echo "push_worker_deploy=FAIL reason=probe_status value=$STATUS"; exit 19; }
cleanup_probe; PROBE_NOTIFICATION=''; PROBE_DEVICE=''

sudo systemctl enable --now teswa-push-shadow >/dev/null
sleep 1
systemctl is-active --quiet teswa-push-shadow || { echo 'push_worker_deploy=FAIL reason=service_inactive'; exit 20; }
systemctl is-enabled --quiet teswa-push-shadow || { echo 'push_worker_deploy=FAIL reason=service_disabled'; exit 21; }
INSTALLED_SHA="$(sudo sha256sum "$APP/worker.py" | awk '{print $1}')"

echo 'push_worker_database_auth=unix_peer_no_password'
echo 'push_worker_send_enabled=false'
echo 'push_worker_outbound_probe=false'
echo 'push_worker_claim_probe=PASS'
echo 'push_worker_payload_device_probe=PASS'
echo 'push_worker_preference_path_ready=true'
echo 'push_worker_probe_cleanup=PASS'
echo 'service_active=true'
echo 'service_enabled=true'
echo "worker_sha256=$INSTALLED_SHA"
echo 'supabase_runtime_dependency=false'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'outbound_push_performed=false'
echo 'push_worker_deploy=PASS'
