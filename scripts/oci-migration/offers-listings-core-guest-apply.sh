#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage directory required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal

sudo -n true || { echo 'offers_listings_operator=FAIL reason=no_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'offers_listings_operator=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'offers_listings_operator=FAIL reason=postgres_inactive'; exit 12; }
ctx="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT to_regprocedure('teswa_runtime.current_user_id()') IS NOT NULL")"
[ "$ctx" = t ] || { echo 'offers_listings_operator=FAIL reason=runtime_context_missing'; exit 13; }
role="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_roles WHERE rolname='teswa_app_authenticated' AND NOT rolcanlogin AND NOT rolbypassrls")"
[ "$role" = 1 ] || { echo 'offers_listings_operator=FAIL reason=app_role_not_green'; exit 14; }

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-offers-listings-core.sql"
echo 'offers_listings_runtime_apply=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/verify-runtime-offers-listings-core.sql"

UIDX="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT owner_id FROM public.items WHERE owner_id IS NOT NULL ORDER BY id LIMIT 1")"
[ -n "$UIDX" ] || { echo 'offers_listings_operator=FAIL reason=no_item_owner'; exit 16; }
EXP_PUBLIC="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.items WHERE status IN ('active','reserved','swapped')")"
EXP_VISIBLE="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.items WHERE status IN ('active','reserved','swapped') OR owner_id='$UIDX'::uuid")"
GOT_PUBLIC="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.items; ROLLBACK" | tail -n1)"
GOT_VISIBLE="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$UIDX',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.items; ROLLBACK" | tail -n1)"
[ "$GOT_PUBLIC" = "$EXP_PUBLIC" ] || { echo "offers_listings_operator=FAIL reason=items_public_rls expected=$EXP_PUBLIC got=$GOT_PUBLIC"; exit 17; }
[ "$GOT_VISIBLE" = "$EXP_VISIBLE" ] || { echo "offers_listings_operator=FAIL reason=items_identity_rls expected=$EXP_VISIBLE got=$GOT_VISIBLE"; exit 18; }

EXP_OFFERS="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM public.offers WHERE sender_id='$UIDX'::uuid OR receiver_id='$UIDX'::uuid")"
GOT_OFFERS="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SELECT set_config('teswa.user_id','$UIDX',true); SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.offers; ROLLBACK" | tail -n1)"
GOT_ANON_OFFERS="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "BEGIN; SET LOCAL ROLE teswa_app_authenticated; SELECT count(*) FROM public.offers; ROLLBACK" | tail -n1)"
[ "$GOT_OFFERS" = "$EXP_OFFERS" ] || { echo "offers_listings_operator=FAIL reason=offers_participant_rls expected=$EXP_OFFERS got=$GOT_OFFERS"; exit 19; }
[ "$GOT_ANON_OFFERS" = 0 ] || { echo "offers_listings_operator=FAIL reason=offers_unauth_visible got=$GOT_ANON_OFFERS"; exit 20; }

bad="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('accept_offer','archive_owned_listing_if_safe','delete_owned_archived_listing_if_safe','enforce_offer_insert_integrity','enforce_offer_lifecycle','guard_items_owner_update','mark_offer_thinking','reactivate_owned_archived_listing','redirect_offer','soft_reject_offer') AND pg_get_functiondef(p.oid) LIKE '%auth.uid()%'")"
[ "$bad" = 0 ] || { echo "offers_listings_operator=FAIL reason=auth_uid_remaining count=$bad"; exit 21; }

echo 'offers_listings_auth_uid_remaining=0'
echo 'offers_listings_rls_semantics=PASS'
echo 'offers_listings_semantic_rehearsal=PASS'
echo 'offers_listings_operator=PASS'
