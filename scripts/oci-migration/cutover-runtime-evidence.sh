#!/usr/bin/env bash
set -u

# Read-only evidence collector for the Teswa Oracle cutover runtime.
# It deliberately does not start/stop services, mutate PostgreSQL, print push
# tokens, or print Firebase/service-account contents.

DB="${TESWA_CUTOVER_DB:-teswa_cutover_20260913}"
PUBLIC_BASE="${TESWA_PUBLIC_API_BASE:-https://core01.tail6afd9b.ts.net}"
PUSH_WORKER="${TESWA_PUSH_WORKER:-/opt/teswa/push-shadow/worker.py}"
FCM_FILE="${TESWA_FCM_SERVICE_ACCOUNT_FILE:-/etc/teswa/fcm-service-account.json}"

section() {
  printf '\n=== %s ===\n' "$1"
}

safe_curl() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 20 "$url" || printf 'curl_failed=%s\n' "$url"
    printf '\n'
  else
    printf 'curl_missing\n'
  fi
}

section "SNAPSHOT"
date -Is 2>/dev/null || date
hostname || true
printf 'database=%s\n' "$DB"
printf 'public_base=%s\n' "$PUBLIC_BASE"

section "TAILSCALE"
if command -v tailscale >/dev/null 2>&1; then
  tailscale ip -4 2>/dev/null || true
  tailscale status 2>/dev/null || true
  if command -v sudo >/dev/null 2>&1; then
    sudo tailscale funnel status 2>/dev/null || true
  else
    tailscale funnel status 2>/dev/null || true
  fi
else
  printf 'tailscale_cli_missing\n'
fi

section "SYSTEMD STATES"
for unit in \
  teswa-api-cutover.service \
  teswa-auth-shadow.service \
  teswa-domain-shadow.service \
  teswa-realtime-shadow.service \
  teswa-push-shadow.service \
  teswa-smart-reengagement-shadow.service; do
  printf '%-40s active=' "$unit"
  systemctl is-active "$unit" 2>/dev/null || true
  printf '%-40s enabled=' "$unit"
  systemctl is-enabled "$unit" 2>/dev/null || true
done

section "LISTENERS"
if command -v ss >/dev/null 2>&1; then
  ss -ltnp 2>/dev/null | grep -E ':(3110|3120|3130|4100|4110|4120|4130|4140|4410)\b' || true
else
  printf 'ss_missing\n'
fi

section "LOCAL CUTOVER GATEWAY"
safe_curl "http://127.0.0.1:4140/healthz"
safe_curl "http://127.0.0.1:4140/v1/auth/healthz"

section "DIRECT SYSTEMD UPSTREAMS"
safe_curl "http://127.0.0.1:3110/healthz"
safe_curl "http://127.0.0.1:3120/healthz"
safe_curl "http://127.0.0.1:3130/healthz"

section "PUBLIC FUNNEL"
safe_curl "${PUBLIC_BASE%/}/healthz"
safe_curl "${PUBLIC_BASE%/}/v1/auth/healthz"

section "PUSH UNIT EFFECTIVE ENVIRONMENT"
systemctl show teswa-push-shadow.service -p Environment --no-pager 2>/dev/null || true

section "PUSH WORKER GENERATION"
if [ -f "$PUSH_WORKER" ]; then
  sha256sum "$PUSH_WORKER" 2>/dev/null || true
  grep -nE 'FCM_CREDENTIAL_FILE|def send_fcm|def send_expo|def is_fcm_device|providers' "$PUSH_WORKER" 2>/dev/null || true
else
  printf 'push_worker_missing=%s\n' "$PUSH_WORKER"
fi

section "FCM CREDENTIAL METADATA ONLY"
if [ -f "$FCM_FILE" ]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo stat -c '%n | owner=%U group=%G mode=%a size=%s' "$FCM_FILE" 2>/dev/null || true
  else
    stat -c '%n | owner=%U group=%G mode=%a size=%s' "$FCM_FILE" 2>/dev/null || true
  fi
else
  printf 'fcm_credential=missing\n'
fi

section "PUSH HEALTH — NO JOB PROCESSING"
if id teswapush >/dev/null 2>&1 && [ -f "$PUSH_WORKER" ]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo -u teswapush env \
      TESWA_DB="$DB" \
      TESWA_PUSH_SEND_ENABLED=0 \
      TESWA_FCM_SERVICE_ACCOUNT_FILE="$FCM_FILE" \
      /usr/bin/python3 "$PUSH_WORKER" --health 2>/dev/null || true
  else
    printf 'sudo_required_for_teswapush_health\n'
  fi
else
  printf 'teswapush_or_worker_missing\n'
fi

section "DATABASE STRUCTURE / DEVICE / OUTBOX EVIDENCE"
if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  sudo -u postgres psql -X -d "$DB" -P pager=off -v ON_ERROR_STOP=1 <<'SQL' || true
SELECT current_database() AS database,
       pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT count(*) AS public_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';

SELECT count(*) AS public_functions
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public';

SELECT count(*) AS public_policies FROM pg_policies WHERE schemaname='public';

SELECT count(*) AS public_rls_tables
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity;

SELECT CASE
  WHEN expo_push_token LIKE 'fcm:%' THEN 'native_fcm_fid'
  WHEN expo_push_token LIKE 'ExponentPushToken[%'
    OR expo_push_token LIKE 'ExpoPushToken[%' THEN 'legacy_expo'
  WHEN expo_push_token IS NULL OR btrim(expo_push_token)='' THEN 'empty'
  ELSE 'other'
END AS device_kind,
count(*) AS total,
count(*) FILTER (WHERE disabled_at IS NULL AND notifications_enabled=true) AS active
FROM public.push_devices
GROUP BY 1 ORDER BY 1;

SELECT status,count(*)
FROM teswa_jobs.push_outbox
GROUP BY status ORDER BY status;

SELECT left(coalesce(last_error,''),120) AS last_error,count(*) AS jobs
FROM teswa_jobs.push_outbox
WHERE coalesce(last_error,'') <> ''
GROUP BY 1 ORDER BY jobs DESC LIMIT 15;
SQL
else
  printf 'postgres_evidence_unavailable\n'
fi

section "IMPORTANT INTERPRETATION"
printf '%s\n' \
  'productionTraffic=false in gateway health is historical metadata, not a cutover switch.' \
  'Do not start the cutover push daemon with TESWA_PUSH_SEND_ENABLED=0: claimed jobs would be skipped.' \
  'Do not print service-account JSON, access tokens, full push tokens, JKS files, or passwords.' \
  'Do not blindly refresh/merge rehearsal and cutover databases.'
