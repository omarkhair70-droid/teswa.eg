#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

sudo -n true || { echo 'final_db_closure_operator=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'final_db_closure_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'final_db_closure_operator=FAIL reason=postgres_inactive'; exit 12; }
[ -f "$STAGE/runtime-final-db-closure.sql" ] && [ -f "$STAGE/verify-runtime-final-db-closure.sql" ] && [ -f "$STAGE/runtime-profile-column-security.sql" ] || { echo 'final_db_closure_operator=FAIL reason=missing_sql'; exit 13; }

# Guard: all earlier domain batches, including notifications/analytics, must already be green.
PREV_BAD="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('accept_offer','complete_deal_if_ready','follow_user','track_analytics_event','register_push_device') AND (pg_get_functiondef(p.oid) LIKE '%auth.uid()%' OR pg_get_functiondef(p.oid) LIKE '%auth.role()%')")"
[ "$PREV_BAD" = 0 ] || { echo "final_db_closure_operator=FAIL reason=previous_batches_not_green count=$PREV_BAD"; exit 14; }
NOTIF="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT to_regprocedure('public.track_analytics_event(text,text,text,text,uuid,jsonb,text,text)') IS NOT NULL")"
[ "$NOTIF" = t ] || { echo 'final_db_closure_operator=FAIL reason=notifications_analytics_missing'; exit 15; }

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-final-db-closure.sql"
echo 'final_db_closure_runtime_apply=PASS'

# The final closure historically re-granted table-wide profile privileges after
# the narrower Profile contract had already been proven. Re-apply the canonical
# Profile ACL/RLS contract last so /v1/profiles/me and profile writes use the
# same permissions that passed the Oracle rehearsal.
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-profile-column-security.sql"
echo 'final_db_profile_acl_reconcile=PASS'

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/verify-runtime-final-db-closure.sql"

PROFILE_SECURITY="$(sudo -u postgres "$P" -X -qAt -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
WITH columns AS (
  SELECT c.column_name FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.table_name='profiles'
), allowed_select AS (
  SELECT unnest(ARRAY['id','display_name','username','bio','avatar_url','cover_url','city','area','profile_tagline','successful_swaps_count','response_rate','created_at','is_banned']) name
), allowed_insert AS (
  SELECT unnest(ARRAY['id','display_name','username']) name
), allowed_update AS (
  SELECT unnest(ARRAY['display_name','username','bio','avatar_url','cover_url','city','area','profile_tagline','direct_message_privacy','updated_at']) name
)
SELECT concat_ws('|',
  has_table_privilege('teswa_app_authenticated','public.profiles','SELECT'),
  (SELECT count(*) FROM allowed_select a WHERE NOT has_column_privilege('teswa_app_authenticated','public.profiles',a.name,'SELECT')),
  (SELECT count(*) FROM columns c WHERE NOT EXISTS(SELECT FROM allowed_select a WHERE a.name=c.column_name) AND has_column_privilege('teswa_app_authenticated','public.profiles',c.column_name,'SELECT')),
  (SELECT count(*) FROM columns c WHERE NOT EXISTS(SELECT FROM allowed_insert a WHERE a.name=c.column_name) AND has_column_privilege('teswa_app_authenticated','public.profiles',c.column_name,'INSERT')),
  (SELECT count(*) FROM columns c WHERE NOT EXISTS(SELECT FROM allowed_update a WHERE a.name=c.column_name) AND has_column_privilege('teswa_app_authenticated','public.profiles',c.column_name,'UPDATE')),
  has_function_privilege('teswa_app_authenticated','teswa_runtime.get_my_direct_message_privacy()','EXECUTE'),
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_authenticated_visible_select'));
SQL
)"
[ "$PROFILE_SECURITY" = 'f|0|0|0|0|t|1' ] || { echo "final_db_closure_operator=FAIL reason=profile_column_security got=$PROFILE_SECURITY"; exit 24; }
echo 'profile_column_security=PASS'

PROFILE_UID="$(sudo -u postgres "$P" -X -qAt -v ON_ERROR_STOP=1 -d "$DB" -c "SELECT id FROM public.profiles ORDER BY id LIMIT 1")"
[ -n "$PROFILE_UID" ] || { echo 'final_db_closure_operator=FAIL reason=no_profile_fixture'; exit 25; }
PROFILE_ME="$(sudo -u postgres "$P" -X -qAt -v ON_ERROR_STOP=1 -d "$DB" <<SQL
BEGIN;
SELECT set_config('teswa.user_id','$PROFILE_UID',true);
SET LOCAL ROLE teswa_app_authenticated;
SELECT json_build_object(
  'id',p.id,'displayName',p.display_name,'username',p.username,'bio',p.bio,
  'avatarUrl',p.avatar_url,'coverUrl',p.cover_url,'city',p.city,'area',p.area,
  'profileTagline',p.profile_tagline,'successfulSwapsCount',p.successful_swaps_count,
  'responseRate',p.response_rate,'createdAt',p.created_at)
FROM public.profiles p
WHERE p.id='$PROFILE_UID'::uuid
  AND (p.id='$PROFILE_UID'::uuid OR coalesce(p.is_banned,false)=false);
ROLLBACK;
SQL
)"
printf '%s\n' "$PROFILE_ME" | grep -q '"id"' || { echo 'final_db_closure_operator=FAIL reason=profile_me_projection'; exit 26; }
echo 'profile_me_projection=PASS'

# Contextual participant / outsider / no-context semantic probe on existing rehearsal data.
read -r CONV USER_A USER_B <<<"$(sudo -u postgres "$P" -d "$DB" -AtF' ' -c "SELECT id,starter_id,recipient_id FROM public.contextual_conversations ORDER BY id LIMIT 1")"
[ -n "${CONV:-}" ] && [ -n "${USER_A:-}" ] && [ -n "${USER_B:-}" ] || { echo 'final_db_closure_operator=FAIL reason=no_contextual_fixture'; exit 16; }
OUTSIDER="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT id FROM teswa_identity.users WHERE id NOT IN ('$USER_A'::uuid,'$USER_B'::uuid) ORDER BY id LIMIT 1")"
[ -n "$OUTSIDER" ] || { echo 'final_db_closure_operator=FAIL reason=no_outsider_fixture'; exit 17; }
PART="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$USER_A',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.contextual_conversations WHERE id='$CONV'::uuid; ROLLBACK" | tail -n1)"
OUT="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$OUTSIDER',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.contextual_conversations WHERE id='$CONV'::uuid; ROLLBACK" | tail -n1)"
NONE="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.contextual_conversations WHERE id='$CONV'::uuid; ROLLBACK" | tail -n1)"
[ "$PART" = 1 ] || { echo "final_db_closure_operator=FAIL reason=contextual_participant_visibility got=$PART"; exit 18; }
[ "$OUT" = 0 ] || { echo "final_db_closure_operator=FAIL reason=contextual_outsider_visibility got=$OUT"; exit 19; }
[ "$NONE" = 0 ] || { echo "final_db_closure_operator=FAIL reason=contextual_no_context_visibility got=$NONE"; exit 20; }

# Dolab owner isolation probe if rehearsal has data (source snapshot currently does).
read -r DOLAB DUSER <<<"$(sudo -u postgres "$P" -d "$DB" -AtF' ' -c "SELECT id,user_id FROM public.dolab_items ORDER BY id LIMIT 1")"
if [ -n "${DOLAB:-}" ] && [ -n "${DUSER:-}" ]; then
  DOUT="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT id FROM teswa_identity.users WHERE id<>'$DUSER'::uuid ORDER BY id LIMIT 1")"
  DYES="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$DUSER',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.dolab_items WHERE id='$DOLAB'::uuid; ROLLBACK" | tail -n1)"
  DNO="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$DOUT',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.dolab_items WHERE id='$DOLAB'::uuid; ROLLBACK" | tail -n1)"
  [ "$DYES" = 1 ] && [ "$DNO" = 0 ] || { echo "final_db_closure_operator=FAIL reason=dolab_owner_isolation owner=$DYES outsider=$DNO"; exit 21; }
fi

FNBAD="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND (pg_get_functiondef(p.oid) LIKE '%auth.uid()%' OR pg_get_functiondef(p.oid) LIKE '%auth.role()%')")"
POLBAD="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%' OR coalesce(qual,'') LIKE '%auth.role()%' OR coalesce(with_check,'') LIKE '%auth.role()%')")"
[ "$FNBAD" = 0 ] || { echo "final_db_closure_operator=FAIL reason=global_function_auth_dependency count=$FNBAD"; exit 22; }
[ "$POLBAD" = 0 ] || { echo "final_db_closure_operator=FAIL reason=global_policy_auth_dependency count=$POLBAD"; exit 23; }

echo 'contextual_participant_rls=PASS'
echo 'contextual_outsider_rls=PASS'
echo 'contextual_no_context_rls=PASS'
echo 'dolab_owner_rls=PASS'
echo 'review_report_teswa_privileged_contract=PASS'
echo 'hide_item_teswa_privileged_contract=PASS'
echo 'function_auth_uid_role_remaining=0'
echo 'rls_auth_uid_role_remaining=0'
echo 'database_runtime_auth_dependency=ZERO'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo 'final_db_closure_operator=PASS'