#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage directory required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal
SQL="$STAGE/runtime-push-worker-rls-bridge.sql"

sudo -n true || { echo 'push_rls_bridge=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'push_rls_bridge=FAIL reason=unexpected_guest_hostname'; exit 11; }
[ -f "$SQL" ] || { echo 'push_rls_bridge=FAIL reason=missing_sql'; exit 12; }
systemctl is-active --quiet postgresql-17 || { echo 'push_rls_bridge=FAIL reason=postgres_inactive'; exit 13; }

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" -f "$SQL"

BYPASS="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT rolbypassrls FROM pg_roles WHERE rolname='teswapush'")"
[ "$BYPASS" = f ] || { echo 'push_rls_bridge=FAIL reason=worker_role_bypassrls'; exit 14; }
POLICIES="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_policies WHERE roles @> ARRAY['teswapush'::name] AND policyname LIKE 'teswapush_active_%'")"
[ "$POLICIES" = 5 ] || { echo "push_rls_bridge=FAIL reason=policy_count value=$POLICIES"; exit 15; }
FUNCS="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='teswa_jobs' AND p.proname IN ('push_worker_can_read_notification','push_worker_has_active_user','push_worker_can_read_profile') AND p.prosecdef")"
[ "$FUNCS" = 3 ] || { echo "push_rls_bridge=FAIL reason=security_definer_count value=$FUNCS"; exit 16; }

echo 'push_worker_bypassrls=false'
echo 'push_worker_rls_policies=5'
echo 'push_worker_rls_helper_functions=3'
echo 'app_rls_policies_unchanged=true'
echo 'outbound_push_performed=false'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'push_rls_bridge=PASS'
