#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

sudo -n true || { echo 'notifications_analytics_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'notifications_analytics_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'notifications_analytics_operator=FAIL reason=postgres_inactive'; exit 12; }
[ -f "$STAGE/runtime-notifications-analytics-core.sql" ] && [ -f "$STAGE/verify-runtime-notifications-analytics-core.sql" ] || { echo 'notifications_analytics_operator=FAIL reason=missing_sql'; exit 13; }
ctx="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT to_regprocedure('teswa_runtime.current_user_id()') IS NOT NULL")"; [ "$ctx" = t ] || { echo 'notifications_analytics_operator=FAIL reason=runtime_context_missing'; exit 14; }
role="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_roles WHERE rolname='teswa_app_authenticated' AND NOT rolcanlogin AND NOT rolbypassrls")"; [ "$role" = 1 ] || { echo 'notifications_analytics_operator=FAIL reason=app_role_not_green'; exit 15; }

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-notifications-analytics-core.sql"
echo 'notifications_analytics_runtime_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/verify-runtime-notifications-analytics-core.sql"

USER_A="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT id FROM teswa_identity.users ORDER BY id LIMIT 1')"; [ -n "$USER_A" ] || { echo 'notifications_analytics_operator=FAIL reason=no_identity_fixture'; exit 16; }
for TABLE in notifications notification_preferences push_devices smart_notification_dispatches; do
  EXP="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.$TABLE WHERE user_id='$USER_A'::uuid")"
  GOT="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$USER_A',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.$TABLE; ROLLBACK" | tail -n1)"
  NOCTX="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.$TABLE; ROLLBACK" | tail -n1)"
  [ "$GOT" = "$EXP" ] || { echo "notifications_analytics_operator=FAIL reason=${TABLE}_rls expected=$EXP got=$GOT"; exit 17; }
  [ "$NOCTX" = 0 ] || { echo "notifications_analytics_operator=FAIL reason=${TABLE}_no_context got=$NOCTX"; exit 18; }
done

BAD_FN="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('create_contextual_message_notification','create_notification','disable_my_push_device','get_my_notification_preferences','get_or_create_notification_preferences','register_push_device','set_my_notification_timezone','track_analytics_event','update_my_notification_preferences') AND pg_get_functiondef(p.oid) LIKE '%auth.uid()%'")"; [ "$BAD_FN" = 0 ] || { echo "notifications_analytics_operator=FAIL reason=function_auth_uid_remaining count=$BAD_FN"; exit 19; }
BAD_POL="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('notifications','notification_preferences','push_devices','smart_notification_dispatches') AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%')")"; [ "$BAD_POL" = 0 ] || { echo "notifications_analytics_operator=FAIL reason=policy_auth_uid_remaining count=$BAD_POL"; exit 20; }

echo 'notifications_analytics_auth_uid_remaining=0'
echo 'notifications_rls=PASS'
echo 'notification_preferences_rls=PASS'
echo 'push_devices_rls=PASS'
echo 'smart_dispatches_rls=PASS'
echo 'analytics_semantics=PASS'
echo 'notifications_analytics_semantic_rehearsal=PASS'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo 'notifications_analytics_operator=PASS'
