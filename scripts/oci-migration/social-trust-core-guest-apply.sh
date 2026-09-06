#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

sudo -n true || { echo 'social_trust_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'social_trust_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'social_trust_operator=FAIL reason=postgres_inactive'; exit 12; }
[ -f "$STAGE/runtime-social-trust-support.sql" ] && [ -f "$STAGE/runtime-social-trust-core.sql" ] && [ -f "$STAGE/verify-runtime-social-trust-core.sql" ] || { echo 'social_trust_operator=FAIL reason=missing_sql'; exit 13; }
ctx="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT to_regprocedure('teswa_runtime.current_user_id()') IS NOT NULL")"
[ "$ctx" = t ] || { echo 'social_trust_operator=FAIL reason=runtime_context_missing'; exit 14; }
role="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_roles WHERE rolname='teswa_app_authenticated' AND NOT rolcanlogin AND NOT rolbypassrls")"
[ "$role" = 1 ] || { echo 'social_trust_operator=FAIL reason=app_role_not_green'; exit 15; }

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-social-trust-support.sql"
echo 'social_trust_support_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-social-trust-core.sql"
echo 'social_trust_runtime_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/verify-runtime-social-trust-core.sql"

USER_A="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT u.id FROM teswa_identity.users u LEFT JOIN public.admin_users a ON a.user_id=u.id LEFT JOIN public.profiles p ON p.id=u.id WHERE a.user_id IS NULL AND coalesce(p.role,'') NOT IN ('admin','moderator') ORDER BY u.id LIMIT 1")"
[ -n "$USER_A" ] || USER_A="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT id FROM teswa_identity.users ORDER BY id LIMIT 1")"
[ -n "$USER_A" ] || { echo 'social_trust_operator=FAIL reason=no_identity_fixture'; exit 16; }

EXP_BLOCKS="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.user_blocks WHERE blocker_id='$USER_A'::uuid")"
GOT_BLOCKS="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$USER_A',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.user_blocks; ROLLBACK" | tail -n1)"
[ "$GOT_BLOCKS" = "$EXP_BLOCKS" ] || { echo "social_trust_operator=FAIL reason=blocks_rls expected=$EXP_BLOCKS got=$GOT_BLOCKS"; exit 17; }

EXP_FOLLOWS="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM public.user_follows')"
GOT_FOLLOWS="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$USER_A',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.user_follows; ROLLBACK" | tail -n1)"
[ "$GOT_FOLLOWS" = "$EXP_FOLLOWS" ] || { echo "social_trust_operator=FAIL reason=follows_authenticated_visibility expected=$EXP_FOLLOWS got=$GOT_FOLLOWS"; exit 18; }
NOCTX_FOLLOWS="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.user_follows; ROLLBACK" | tail -n1)"
[ "$NOCTX_FOLLOWS" = 0 ] || { echo "social_trust_operator=FAIL reason=follows_no_context_visible got=$NOCTX_FOLLOWS"; exit 19; }

EXP_STORIES="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM public.stories WHERE expires_at>now()')"
GOT_STORIES="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$USER_A',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.stories; ROLLBACK" | tail -n1)"
[ "$GOT_STORIES" = "$EXP_STORIES" ] || { echo "social_trust_operator=FAIL reason=stories_active_visibility expected=$EXP_STORIES got=$GOT_STORIES"; exit 20; }
NOCTX_STORIES="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.stories; ROLLBACK" | tail -n1)"
[ "$NOCTX_STORIES" = 0 ] || { echo "social_trust_operator=FAIL reason=stories_no_context_visible got=$NOCTX_STORIES"; exit 21; }

BAD_FN="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_user_badges','get_user_trust_metrics','enforce_reports_rate_limit','follow_user','unfollow_user','get_user_block_state','get_user_follow_state','get_my_badges','get_my_trust_metrics','is_admin_user','refresh_my_badges','report_user','report_story','report_direct_message') AND pg_get_functiondef(p.oid) LIKE '%auth.uid()%'")"
[ "$BAD_FN" = 0 ] || { echo "social_trust_operator=FAIL reason=function_auth_uid_remaining count=$BAD_FN"; exit 22; }
BAD_POL="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('user_follows','user_blocks','admin_users','reports','stories','story_likes','story_views') AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%')")"
[ "$BAD_POL" = 0 ] || { echo "social_trust_operator=FAIL reason=policy_auth_uid_remaining count=$BAD_POL"; exit 23; }

echo 'social_trust_support_helpers=PASS'
echo 'social_trust_auth_uid_remaining=0'
echo 'social_trust_blocks_rls=PASS'
echo 'social_trust_follows_rls=PASS'
echo 'social_trust_no_context_guard=PASS'
echo 'social_trust_stories_rls=PASS'
echo 'social_trust_semantic_rehearsal=PASS'
echo 'review_report_privileged_service_semantics=DEFERRED'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo 'social_trust_operator=PASS'
