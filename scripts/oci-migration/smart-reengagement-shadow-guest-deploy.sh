#!/usr/bin/env bash
set -Eeuo pipefail

STAGE="${1:?stage directory required}"
APP=/opt/teswa/smart-reengagement-shadow
SERVICE=/etc/systemd/system/teswa-smart-reengagement-shadow.service
TIMER=/etc/systemd/system/teswa-smart-reengagement-shadow.timer
MARK=/etc/teswa/lane4-smart-reengagement-shadow-owned
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

sudo -n true || { echo 'smart_reengagement_deploy=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'smart_reengagement_deploy=FAIL reason=unexpected_guest_hostname'; exit 11; }
[ -f "$STAGE/worker.py" ] || { echo 'smart_reengagement_deploy=FAIL reason=missing_worker'; exit 12; }
systemctl is-active --quiet postgresql-17 || { echo 'smart_reengagement_deploy=FAIL reason=postgres_inactive'; exit 13; }
[ "$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT CASE WHEN to_regclass('teswa_jobs.push_outbox') IS NULL THEN '0' ELSE '1' END")" = 1 ] || { echo 'smart_reengagement_deploy=FAIL reason=push_outbox_missing'; exit 14; }
systemctl is-active --quiet teswa-push-shadow || { echo 'smart_reengagement_deploy=FAIL reason=push_worker_not_active'; exit 15; }

if sudo test -e "$SERVICE" && ! sudo test -e "$MARK"; then echo 'smart_reengagement_deploy=FAIL reason=unowned_existing_service'; exit 16; fi
if sudo test -e "$TIMER" && ! sudo test -e "$MARK"; then echo 'smart_reengagement_deploy=FAIL reason=unowned_existing_timer'; exit 17; fi
if sudo test -e "$MARK"; then sudo systemctl stop teswa-smart-reengagement-shadow.timer >/dev/null 2>&1 || true; fi

if ! id teswasmart >/dev/null 2>&1; then sudo useradd --system --home-dir /nonexistent --shell /sbin/nologin teswasmart; fi

# Trusted internal worker: local peer-auth only, no password, narrow table grants.
# BYPASSRLS is required because this job intentionally evaluates candidates
# across users, replacing the former Supabase service-role Edge Function.
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswasmart') THEN
    CREATE ROLE teswasmart LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
  END IF;
END;
$$;
ALTER ROLE teswasmart LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
GRANT USAGE ON SCHEMA public,teswa_jobs TO teswasmart;
GRANT SELECT ON public.offers,public.swap_deals,public.deal_messages,public.deal_confirmations,
  public.deal_message_reads,public.contextual_conversations,public.contextual_messages,
  public.contextual_message_reads,public.items,public.notification_preferences,
  public.smart_notification_dispatches TO teswasmart;
GRANT INSERT,UPDATE ON public.smart_notification_dispatches TO teswasmart;
GRANT INSERT ON public.notifications TO teswasmart;
SQL
sudo -u teswasmart "$P" -X -qAt -d "$DB" -c 'select 1' | grep -qx 1 || { echo 'smart_reengagement_deploy=FAIL reason=peer_database_login_failed'; exit 18; }

sudo install -d -m 0755 /etc/teswa
sudo install -d -o root -g teswasmart -m 0750 "$APP"
sudo install -o root -g teswasmart -m 0640 "$STAGE/worker.py" "$APP/worker.py"

TMP="$(mktemp)"
cat >"$TMP" <<EOF
[Unit]
Description=Teswa smart re-engagement shadow worker
After=postgresql-17.service teswa-push-shadow.service
Requires=postgresql-17.service teswa-push-shadow.service

[Service]
Type=oneshot
User=teswasmart
Group=teswasmart
Environment=PYTHONUNBUFFERED=1
Environment=TESWA_DB=teswa_rehearsal
Environment=TESWA_SMART_APPLY=0
ExecStart=/usr/bin/python3 $APP/worker.py --once
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
MemoryMax=160M
EOF
sudo install -o root -g root -m 0644 "$TMP" "$SERVICE"
cat >"$TMP" <<'EOF'
[Unit]
Description=Run Teswa smart re-engagement shadow hourly

[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=120
Unit=teswa-smart-reengagement-shadow.service

[Install]
WantedBy=timers.target
EOF
sudo install -o root -g root -m 0644 "$TMP" "$TIMER"
rm -f "$TMP"
sudo touch "$MARK"
sudo systemctl daemon-reload

HEALTH="$(sudo -u teswasmart env TESWA_DB="$DB" TESWA_SMART_APPLY=0 python3 "$APP/worker.py" --health)"
printf '%s' "$HEALTH" | python3 -c 'import json,sys;x=json.load(sys.stdin);assert x["status"]=="ok" and x["applyEnabled"] is False and x["outboundPush"] is False and x["supabaseRuntimeDependency"] is False'
DRY="$(sudo -u teswasmart env TESWA_DB="$DB" TESWA_SMART_APPLY=0 python3 "$APP/worker.py" --once)"
printf '%s' "$DRY" | python3 -c 'import json,sys;x=json.load(sys.stdin);assert x["applyEnabled"] is False and x["outboundPush"] is False and isinstance(x.get("candidates"),int) and x.get("inserted")==0'

sudo systemctl enable --now teswa-smart-reengagement-shadow.timer >/dev/null
systemctl is-active --quiet teswa-smart-reengagement-shadow.timer || { echo 'smart_reengagement_deploy=FAIL reason=timer_inactive'; exit 19; }
systemctl is-enabled --quiet teswa-smart-reengagement-shadow.timer || { echo 'smart_reengagement_deploy=FAIL reason=timer_disabled'; exit 20; }
SHA="$(sudo sha256sum "$APP/worker.py" | awk '{print $1}')"
echo 'smart_scheduler=systemd_timer_hourly'
echo 'smart_apply_enabled=false'
echo 'smart_dry_run_probe=PASS'
echo 'smart_outbound_push=false'
echo 'smart_worker_database_auth=unix_peer_no_password'
echo 'smart_internal_role_bypassrls=true_limited_grants'
echo 'timer_active=true'
echo 'timer_enabled=true'
echo "worker_sha256=$SHA"
echo 'supabase_runtime_dependency=false'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'smart_reengagement_deploy=PASS'
