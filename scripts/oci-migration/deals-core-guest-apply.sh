#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

sudo -n true || { echo 'deals_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'deals_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'deals_operator=FAIL reason=postgres_inactive'; exit 12; }
[ -f "$STAGE/runtime-deals-core.sql" ] && [ -f "$STAGE/verify-runtime-deals-core.sql" ] || { echo 'deals_operator=FAIL reason=missing_sql'; exit 13; }
ctx="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT to_regprocedure('teswa_runtime.current_user_id()') IS NOT NULL")"
[ "$ctx" = t ] || { echo 'deals_operator=FAIL reason=runtime_context_missing'; exit 14; }
role="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_roles WHERE rolname='teswa_app_authenticated' AND NOT rolcanlogin AND NOT rolbypassrls")"
[ "$role" = 1 ] || { echo 'deals_operator=FAIL reason=app_role_not_green'; exit 15; }

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-deals-core.sql"
echo 'deals_runtime_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/verify-runtime-deals-core.sql"

read -r DEAL ACTOR PEER <<<"$(sudo -u postgres "$P" -d "$DB" -AtF' ' -c "SELECT id,requester_id,offerer_id FROM public.swap_deals ORDER BY id LIMIT 1")"
[ -n "${DEAL:-}" ] && [ -n "${ACTOR:-}" ] && [ -n "${PEER:-}" ] || { echo 'deals_operator=FAIL reason=no_deal_fixture'; exit 16; }
OUTSIDER="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT id FROM teswa_identity.users WHERE id NOT IN ('$ACTOR'::uuid,'$PEER'::uuid) ORDER BY id LIMIT 1")"
[ -n "$OUTSIDER" ] || { echo 'deals_operator=FAIL reason=no_outsider_fixture'; exit 17; }

participant="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$ACTOR',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.swap_deals WHERE id='$DEAL'::uuid; ROLLBACK" | tail -n1)"
outsider="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$OUTSIDER',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.swap_deals WHERE id='$DEAL'::uuid; ROLLBACK" | tail -n1)"
unauth="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.swap_deals WHERE id='$DEAL'::uuid; ROLLBACK" | tail -n1)"
[ "$participant" = 1 ] || { echo "deals_operator=FAIL reason=participant_visibility value=$participant"; exit 18; }
[ "$outsider" = 0 ] || { echo "deals_operator=FAIL reason=outsider_visibility value=$outsider"; exit 19; }
[ "$unauth" = 0 ] || { echo "deals_operator=FAIL reason=unauth_visibility value=$unauth"; exit 20; }

exp_messages="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.deal_messages WHERE deal_id='$DEAL'::uuid")"
got_messages="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$ACTOR',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.deal_messages WHERE deal_id='$DEAL'::uuid; ROLLBACK" | tail -n1)"
[ "$got_messages" = "$exp_messages" ] || { echo "deals_operator=FAIL reason=message_participant_visibility expected=$exp_messages got=$got_messages"; exit 21; }

exp_reviews="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM public.reviews')"
got_reviews="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.reviews; ROLLBACK" | tail -n1)"
[ "$got_reviews" = "$exp_reviews" ] || { echo "deals_operator=FAIL reason=reviews_public_visibility expected=$exp_reviews got=$got_reviews"; exit 22; }

bad="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('complete_deal_if_ready','get_unread_deal_messages_count','mark_deal_thread_read','report_deal','report_deal_message','report_item') AND pg_get_functiondef(p.oid) LIKE '%auth.uid()%'")"
[ "$bad" = 0 ] || { echo "deals_operator=FAIL reason=auth_uid_remaining count=$bad"; exit 23; }

echo 'deals_auth_uid_remaining=0'
echo 'deals_participant_rls=PASS'
echo 'deals_outsider_rls=PASS'
echo 'deals_unauth_rls=PASS'
echo 'deals_message_visibility=PASS'
echo 'deals_reviews_public_visibility=PASS'
echo 'deals_semantic_rehearsal=PASS'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo 'deals_operator=PASS'
