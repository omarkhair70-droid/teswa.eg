#!/usr/bin/env bash
set -euo pipefail

# Guarded operator for the Teswa cutover push worker.
# Default mode is read-only status. Activation is intentionally hard to trigger.
# Never commit the Firebase service-account JSON used by this operator.

MODE="${1:-status}"
DB="${TESWA_CUTOVER_DB:-teswa_cutover_20260913}"
WORKER="${TESWA_PUSH_WORKER:-/opt/teswa/push-shadow/worker.py}"
FCM_FILE="${TESWA_FCM_SERVICE_ACCOUNT_FILE:-/etc/teswa/fcm-service-account.json}"
UNIT="teswa-push-shadow.service"
DROPIN_DIR="/etc/systemd/system/${UNIT}.d"
DROPIN_FILE="${DROPIN_DIR}/20-cutover-live.conf"

say() { printf '%s\n' "$*"; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    say "error=run_as_root"
    exit 2
  fi
}

psql_scalar() {
  sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" -c "$1"
}

status() {
  say "database=$DB"
  say "worker=$WORKER"
  say "fcm_file=$FCM_FILE"
  say "service_active=$(systemctl is-active "$UNIT" 2>/dev/null || true)"
  say "service_enabled=$(systemctl is-enabled "$UNIT" 2>/dev/null || true)"
  systemctl show "$UNIT" -p Environment --no-pager 2>/dev/null || true

  if [ -f "$FCM_FILE" ]; then
    stat -c 'fcm_metadata=%n owner=%U group=%G mode=%a size=%s' "$FCM_FILE"
  else
    say "fcm_credential=missing"
  fi

  if [ -f "$WORKER" ] && id teswapush >/dev/null 2>&1; then
    sudo -u teswapush env \
      TESWA_DB="$DB" \
      TESWA_PUSH_SEND_ENABLED=0 \
      TESWA_FCM_SERVICE_ACCOUNT_FILE="$FCM_FILE" \
      /usr/bin/python3 "$WORKER" --health || true
  else
    say "worker_or_teswapush=missing"
  fi

  if id postgres >/dev/null 2>&1; then
    say "active_native_fcm_devices=$(psql_scalar "SELECT count(*) FROM public.push_devices WHERE expo_push_token LIKE 'fcm:%' AND disabled_at IS NULL AND notifications_enabled=true")"
    say "active_legacy_expo_devices=$(psql_scalar "SELECT count(*) FROM public.push_devices WHERE (expo_push_token LIKE 'ExponentPushToken[%' OR expo_push_token LIKE 'ExpoPushToken[%') AND disabled_at IS NULL AND notifications_enabled=true")"
    say "pending_jobs=$(psql_scalar "SELECT count(*) FROM teswa_jobs.push_outbox WHERE status='pending'")"
    say "processing_jobs=$(psql_scalar "SELECT count(*) FROM teswa_jobs.push_outbox WHERE status='processing'")"
  fi
}

preflight() {
  [ -f "$WORKER" ] || { say "error=push_worker_missing"; exit 3; }
  [ -f "$FCM_FILE" ] || { say "error=fcm_credential_missing"; exit 3; }
  id teswapush >/dev/null 2>&1 || { say "error=teswapush_user_missing"; exit 3; }
  id postgres >/dev/null 2>&1 || { say "error=postgres_user_missing"; exit 3; }

  grep -q 'def send_fcm' "$WORKER" || { say "error=worker_missing_fcm_support"; exit 3; }
  grep -q 'providers' "$WORKER" || { say "error=worker_missing_provider_health"; exit 3; }

  local health
  health="$(sudo -u teswapush env \
    TESWA_DB="$DB" \
    TESWA_PUSH_SEND_ENABLED=1 \
    TESWA_FCM_SERVICE_ACCOUNT_FILE="$FCM_FILE" \
    /usr/bin/python3 "$WORKER" --health)"
  say "$health"
  printf '%s' "$health" | grep -q '"status":"ok"' || { say "error=worker_health_not_ok"; exit 3; }
  printf '%s' "$health" | grep -q '"fcmConfigured":true' || { say "error=fcm_not_configured"; exit 3; }

  local processing native
  processing="$(psql_scalar "SELECT count(*) FROM teswa_jobs.push_outbox WHERE status='processing'")"
  [ "$processing" = "0" ] || { say "error=processing_jobs_present count=$processing"; exit 3; }

  native="$(psql_scalar "SELECT count(*) FROM public.push_devices WHERE expo_push_token LIKE 'fcm:%' AND disabled_at IS NULL AND notifications_enabled=true")"
  if [ "$native" = "0" ] && [ "${TESWA_PUSH_ALLOW_NO_NATIVE_DEVICE:-0}" != "1" ]; then
    say "error=no_active_native_fcm_device"
    say "hint=install/update native app and observe fcm: registration first"
    exit 3
  fi

  say "preflight=PASS"
  say "active_native_fcm_devices=$native"
}

activate() {
  require_root
  if [ "${TESWA_PUSH_ACTIVATE_CONFIRM:-}" != "$DB" ]; then
    say "error=activation_confirmation_missing"
    say "hint=export TESWA_PUSH_ACTIVATE_CONFIRM=$DB"
    exit 4
  fi

  preflight

  mkdir -p "$DROPIN_DIR"
  cat > "$DROPIN_FILE" <<EOF
[Service]
Environment=TESWA_DB=$DB
Environment=TESWA_PUSH_SEND_ENABLED=1
Environment=TESWA_FCM_SERVICE_ACCOUNT_FILE=$FCM_FILE
EOF

  systemctl daemon-reload
  systemctl enable --now "$UNIT"
  sleep 2

  say "service_active=$(systemctl is-active "$UNIT")"
  say "service_enabled=$(systemctl is-enabled "$UNIT")"
  systemctl show "$UNIT" -p Environment --no-pager
  journalctl -u "$UNIT" -n 40 --no-pager || true
  say "activation=COMPLETE"
}

case "$MODE" in
  status)
    status
    ;;
  preflight)
    preflight
    ;;
  activate)
    activate
    ;;
  *)
    say "usage=$0 [status|preflight|activate]"
    exit 64
    ;;
esac
