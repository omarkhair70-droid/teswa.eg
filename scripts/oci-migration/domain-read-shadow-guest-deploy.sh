#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
STAGE="${1:?stage directory required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal
APP=/opt/teswa/domain-shadow
UNIT=/etc/systemd/system/teswa-domain-shadow.service
MARK=/etc/teswa/lane4-domain-shadow-owned
GATEWAY=/opt/teswa/api-shell/shadow_gateway.py
TMP="$(mktemp -d)"
TEST_UID=""
TEST_ITEM_ID=""
ACCESS=""
MEDIA_KEY=""
ROLLBACK=true

cleanup() {
  if [ -n "${ACCESS:-}" ] && [ -n "${MEDIA_KEY:-}" ]; then
    python3 - "$TMP/media-delete.json" "$TEST_UID" "$MEDIA_KEY" <<'PY' >/dev/null 2>&1 || true
import json,sys
json.dump({'objects':[{'purpose':'item_image','objectKey':sys.argv[3],'contentType':'image/jpeg','sizeBytes':None}]},open(sys.argv[1],'w'))
PY
    curl --noproxy '*' --max-time 8 -sS -X DELETE -H 'Content-Type: application/json' -H "Authorization: Bearer $ACCESS" --data-binary "@$TMP/media-delete.json" http://127.0.0.1:3130/v1/media/objects >/dev/null 2>&1 || true
  fi
  if [ -n "${TEST_UID:-}" ]; then
    sudo -u postgres "$P" -X -q -v ON_ERROR_STOP=0 -d "$DB" <<SQL >/dev/null 2>&1 || true
BEGIN;
DELETE FROM public.item_wanted_tags WHERE item_id=NULLIF('$TEST_ITEM_ID','')::uuid;
DELETE FROM public.item_videos WHERE item_id=NULLIF('$TEST_ITEM_ID','')::uuid;
DELETE FROM public.item_images WHERE item_id=NULLIF('$TEST_ITEM_ID','')::uuid;
DELETE FROM public.items WHERE id=NULLIF('$TEST_ITEM_ID','')::uuid;
DELETE FROM teswa_auth.sessions WHERE user_id='$TEST_UID'::uuid;
DELETE FROM teswa_auth.email_confirmation_tokens WHERE user_id='$TEST_UID'::uuid;
DELETE FROM teswa_auth.email_accounts WHERE user_id='$TEST_UID'::uuid;
DELETE FROM public.profiles WHERE id='$TEST_UID'::uuid;
DELETE FROM teswa_identity.external_identities WHERE user_id='$TEST_UID'::uuid;
DELETE FROM teswa_identity.users WHERE id='$TEST_UID'::uuid;
COMMIT;
SQL
  fi
  if [ "$ROLLBACK" = true ]; then
    sudo systemctl disable --now teswa-domain-shadow >/dev/null 2>&1 || true
    if [ -f "$TMP/gateway.py" ]; then sudo install -o root -g root -m 0644 "$TMP/gateway.py" "$GATEWAY"; fi
    sudo systemctl restart teswa-api >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT

[ "$(hostname -s)" = core01 ] || { echo 'domain_read_deploy=FAIL wrong_host'; exit 10; }
sudo -n true
systemctl is-active --quiet postgresql-17
systemctl is-active --quiet teswa-auth-shadow
systemctl is-active --quiet teswa-api
for file in oracle_domain_read.py oracle_marketplace_write.py oracle_marketplace_lifecycle.py oracle_exchange.py oracle_exchange_read.py oracle_exchange_read_extra.py oracle_media.py oracle_profiles.py oracle_notifications.py oracle_reviews.py oracle_direct_messaging.py oracle_contextual_messaging.py oracle_stories.py oracle_discovery.py oracle_dolab.py oracle_policies_analytics.py oracle_moderation.py oracle_account.py diagnose_oracle_profile.py oracle_domain_service.py auth-api-shadow-gateway.py runtime-domain-api-grants.sql runtime-profile-column-security.sql runtime-account-deletion.sql domain_exchange_e2e.py; do
  [ -f "$STAGE/$file" ] || { echo "domain_read_deploy=FAIL missing_$file"; exit 11; }
done
if sudo test -e "$UNIT" && ! sudo test -e "$MARK"; then
  echo 'domain_read_deploy=FAIL unowned_unit'; exit 12
fi
sudo cp -p "$GATEWAY" "$TMP/gateway.py"

if ! id teswaapi >/dev/null 2>&1; then
  sudo useradd --system --home-dir /nonexistent --shell /sbin/nologin teswaapi
fi
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teswaapi') THEN
    CREATE ROLE teswaapi LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE teswaapi LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT teswa_app_authenticated TO teswaapi;
GRANT SELECT ON public.categories TO teswa_app_authenticated;
SQL
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-domain-api-grants.sql"
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-profile-column-security.sql"
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
[ "$PROFILE_SECURITY" = 'f|0|0|0|0|t|1' ] || { echo "domain_read_deploy=FAIL profile_column_security=$PROFILE_SECURITY"; exit 18; }
echo 'profile_column_security=PASS'
sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$STAGE/runtime-account-deletion.sql"
ROLE_OK="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "SELECT count(*) FROM pg_roles WHERE rolname='teswaapi' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls")"
[ "$ROLE_OK" = 1 ] || { echo 'domain_read_deploy=FAIL unsafe_database_role'; exit 13; }
sudo -u teswaapi "$P" -X -qAt -d "$DB" -c 'SELECT 1' | grep -qx 1

sudo install -d -o root -g teswaapi -m 0750 "$APP"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_domain_read.py" "$APP/oracle_domain_read.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_marketplace_write.py" "$APP/oracle_marketplace_write.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_marketplace_lifecycle.py" "$APP/oracle_marketplace_lifecycle.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_exchange.py" "$APP/oracle_exchange.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_exchange_read.py" "$APP/oracle_exchange_read.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_exchange_read_extra.py" "$APP/oracle_exchange_read_extra.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_media.py" "$APP/oracle_media.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_profiles.py" "$APP/oracle_profiles.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_notifications.py" "$APP/oracle_notifications.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_reviews.py" "$APP/oracle_reviews.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_direct_messaging.py" "$APP/oracle_direct_messaging.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_contextual_messaging.py" "$APP/oracle_contextual_messaging.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_stories.py" "$APP/oracle_stories.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_discovery.py" "$APP/oracle_discovery.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_dolab.py" "$APP/oracle_dolab.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_policies_analytics.py" "$APP/oracle_policies_analytics.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_moderation.py" "$APP/oracle_moderation.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_account.py" "$APP/oracle_account.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/diagnose_oracle_profile.py" "$APP/diagnose_oracle_profile.py"
sudo install -o root -g teswaapi -m 0640 "$STAGE/oracle_domain_service.py" "$APP/server.py"
sudo install -o root -g root -m 0644 "$STAGE/auth-api-shadow-gateway.py" "$GATEWAY"
cat > "$TMP/unit" <<EOF
[Unit]
Description=Teswa Oracle domain shadow
After=network-online.target postgresql-17.service teswa-auth-shadow.service
Requires=postgresql-17.service teswa-auth-shadow.service

[Service]
Type=simple
User=teswaapi
Group=teswaapi
WorkingDirectory=$APP
Environment=PYTHONUNBUFFERED=1
Environment=TESWA_DOMAIN_DATABASE_URL=dbname=teswa_rehearsal
ExecStart=/usr/bin/python3 $APP/server.py --bind 127.0.0.1 --port 3130
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
TasksMax=96
MemoryMax=160M

[Install]
WantedBy=multi-user.target
EOF
sudo install -o root -g root -m 0644 "$TMP/unit" "$UNIT"
sudo install -d -m 0755 /etc/teswa
sudo touch "$MARK"
sudo systemctl daemon-reload
sudo systemctl enable --now teswa-domain-shadow >/dev/null
sudo systemctl restart teswa-api

for _ in $(seq 1 20); do
  curl --noproxy '*' --max-time 3 -fsS http://127.0.0.1:3130/healthz > "$TMP/health.json" 2>/dev/null && break
  sleep 1
done
[ -s "$TMP/health.json" ] || { echo 'domain_read_deploy=FAIL service_health_timeout'; sudo journalctl -u teswa-domain-shadow -n 40 --no-pager || true; exit 14; }
python3 - "$TMP/health.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert x['status']=='ok' and x['productionTraffic'] is False and x['supabaseRuntimeDependency'] is False
PY

STAMP="$(date +%s)"; EMAIL="domain-read-$STAMP@teswa.invalid"; PASS='Teswa-Domain-Read-2026'
CODE="$(curl --noproxy '*' --max-time 5 -sS -o "$TMP/signup.json" -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" http://127.0.0.1:3110/v1/auth/sign-up)"
[ "$CODE" = 201 ] || { echo "domain_read_deploy=FAIL signup_http_$CODE"; cat "$TMP/signup.json" || true; exit 15; }
TEST_UID="$(python3 - "$TMP/signup.json" <<'PY'
import json,sys,uuid
x=json.load(open(sys.argv[1])); v=x['user']['id']; uuid.UUID(v); print(v)
PY
)"
TOKEN_SHA="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c "SELECT token_sha256 FROM teswa_auth.email_confirmation_tokens WHERE user_id='$TEST_UID'::uuid AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1")"
[ ${#TOKEN_SHA} -eq 64 ] || { echo 'domain_read_deploy=FAIL confirmation_token_missing'; exit 16; }
sudo -u postgres "$P" -X -qAt -d "$DB" -c "SELECT teswa_auth.consume_email_confirmation('$TOKEN_SHA')" | grep -qx "$TEST_UID"
CODE="$(curl --noproxy '*' --max-time 5 -sS -o "$TMP/login.json" -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" http://127.0.0.1:3110/v1/auth/sign-in/password)"
[ "$CODE" = 200 ] || { echo "domain_read_deploy=FAIL signin_http_$CODE"; cat "$TMP/login.json" || true; exit 17; }
ACCESS="$(python3 - "$TMP/login.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['access_token'])
PY
)"
PROFILE_DIAGNOSTIC="$(sudo -u teswaapi env TESWA_DOMAIN_DATABASE_URL="dbname=$DB" \
  python3 "$APP/diagnose_oracle_profile.py" --user-id "$TEST_UID")"
echo "profile_diagnostic=$PROFILE_DIAGNOSTIC"
python3 - "$PROFILE_DIAGNOSTIC" <<'PY'
import json,sys
result=json.loads(sys.argv[1])
assert result.get('ok') is True, result
assert result.get('profileFound') is True, result
assert result.get('missingColumns') == [], result
PY
CODE="$(curl --noproxy '*' --max-time 8 -sS -o "$TMP/feed.json" -w '%{http_code}' -H "Authorization: Bearer $ACCESS" http://127.0.0.1:3130/v1/marketplace/feed?limit=1)"
[ "$CODE" = 200 ] || { echo "domain_read_deploy=FAIL direct_feed_http_$CODE"; cat "$TMP/feed.json" || true; exit 18; }
python3 - "$TMP/feed.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert isinstance(x['items'],list) and isinstance(x['hasMore'],bool)
PY
ITEM_ID="$(python3 - "$TMP/feed.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); print(x['items'][0]['id'] if x['items'] else '')
PY
)"
[ -n "$ITEM_ID" ] || { echo 'domain_read_deploy=FAIL empty_rehearsal_feed'; exit 19; }
CODE="$(curl --noproxy '*' --max-time 8 -sS -o "$TMP/detail.json" -w '%{http_code}' -H "Authorization: Bearer $ACCESS" "http://127.0.0.1:3130/v1/marketplace/items/$ITEM_ID/detail")"
[ "$CODE" = 200 ] || { echo "domain_read_deploy=FAIL detail_http_$CODE"; cat "$TMP/detail.json" || true; exit 20; }
python3 - "$TMP/detail.json" "$ITEM_ID" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert x['id']==sys.argv[2] and isinstance(x['images'],list) and isinstance(x['wantedTags'],list)
PY
BIND="$(sudo sed -n 's/.*--bind \([0-9.]*\).*/\1/p' /etc/systemd/system/teswa-api.service)"
for _ in $(seq 1 20); do
  curl --noproxy '*' --max-time 3 -fsS "http://$BIND:3100/healthz" > "$TMP/gateway-health.json" 2>/dev/null && break
  sleep 1
done
[ -s "$TMP/gateway-health.json" ] || { echo 'domain_read_deploy=FAIL gateway_health_timeout'; sudo journalctl -u teswa-api -n 40 --no-pager || true; exit 21; }
CODE="$(curl --noproxy '*' --max-time 8 -sS -o "$TMP/gateway-feed.json" -w '%{http_code}' -H "Authorization: Bearer $ACCESS" "http://$BIND:3100/v1/marketplace/feed?limit=1")"
[ "$CODE" = 200 ] || { echo "domain_read_deploy=FAIL gateway_feed_http_$CODE bind=$BIND"; cat "$TMP/gateway-feed.json" || true; exit 19; }

TEST_ITEM_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
MEDIA_KEY="items/$TEST_UID/$TEST_ITEM_ID/rehearsal.jpg"
printf 'teswa-oci-media-proof' > "$TMP/media.bin"
MEDIA_SIZE="$(wc -c < "$TMP/media.bin" | tr -d ' ')"
python3 - "$TMP/media-create.json" "$MEDIA_KEY" "$MEDIA_SIZE" <<'PY'
import json,sys
json.dump({'purpose':'item_image','objectKey':sys.argv[2],'contentType':'image/jpeg','sizeBytes':int(sys.argv[3])},open(sys.argv[1],'w'))
PY
CODE="$(curl --noproxy '*' --max-time 12 -sS -o "$TMP/media-grant.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer $ACCESS" --data-binary "@$TMP/media-create.json" "http://$BIND:3100/v1/media/uploads")"
[ "$CODE" = 201 ] || { echo "domain_media_rehearsal=FAIL grant_http_$CODE"; cat "$TMP/media-grant.json" || true; exit 22; }
UPLOAD_URL="$(python3 - "$TMP/media-grant.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['uploadUrl'])
PY
)"
CODE="$(curl --noproxy '*' --max-time 20 -sS -o "$TMP/media-put.json" -w '%{http_code}' -X PUT -H 'Content-Type: image/jpeg' -H 'If-None-Match: *' --data-binary "@$TMP/media.bin" "$UPLOAD_URL")"
case "$CODE" in 200|201) ;; *) echo "domain_media_rehearsal=FAIL put_http_$CODE"; cat "$TMP/media-put.json" || true; exit 23;; esac
CODE="$(curl --noproxy '*' --max-time 12 -sS -o "$TMP/media-complete.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer $ACCESS" --data-binary "@$TMP/media-create.json" "http://$BIND:3100/v1/media/uploads/complete")"
[ "$CODE" = 200 ] || { echo "domain_media_rehearsal=FAIL complete_http_$CODE"; cat "$TMP/media-complete.json" || true; exit 24; }
PUBLIC_URL="$(python3 - "$TMP/media-complete.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['publicUrl'])
PY
)"
curl --noproxy '*' --max-time 20 -fsS "$PUBLIC_URL" -o "$TMP/media-read.bin"
cmp -s "$TMP/media.bin" "$TMP/media-read.bin" || { echo 'domain_media_rehearsal=FAIL byte_mismatch'; exit 25; }

CATEGORY_ID="$(sudo -u postgres "$P" -X -qAt -d "$DB" -c 'SELECT id FROM public.categories WHERE is_active IS TRUE ORDER BY sort_order NULLS LAST,id LIMIT 1')"
python3 - "$TMP/publish.json" "$TEST_ITEM_ID" "$TEST_UID" "$CATEGORY_ID" "$PUBLIC_URL" <<'PY'
import json,sys
item,user,category,url=sys.argv[2:]
json.dump({'itemId':item,'ownerId':user,'title':'Oracle rehearsal item','categoryId':category,
'description':'Temporary verified rehearsal row','condition':'good_used','conditionNotes':None,
'city':'Cairo','area':None,'locationLatitude':None,'locationLongitude':None,'desireMode':'flexible',
'desireText':None,'itemStory':None,'swapReason':None,'goodFor':None,
'images':[{'imageUrl':url,'isPrimary':True,'sortOrder':0}]},open(sys.argv[1],'w'))
PY
CODE="$(curl --noproxy '*' --max-time 12 -sS -o "$TMP/publish-result.json" -w '%{http_code}' -H 'Content-Type: application/json' -H "Authorization: Bearer $ACCESS" --data-binary "@$TMP/publish.json" "http://$BIND:3100/v1/marketplace/items")"
[ "$CODE" = 201 ] || { echo "domain_publish_rehearsal=FAIL publish_http_$CODE"; cat "$TMP/publish-result.json" || true; sudo journalctl -u teswa-domain-shadow -n 20 --no-pager | grep 'domain_write_rejected' | tail -1 || true; exit 26; }
CODE="$(curl --noproxy '*' --max-time 12 -sS -o "$TMP/published-detail.json" -w '%{http_code}' -H "Authorization: Bearer $ACCESS" "http://$BIND:3100/v1/marketplace/items/$TEST_ITEM_ID/detail")"
[ "$CODE" = 200 ] || { echo "domain_publish_rehearsal=FAIL detail_http_$CODE"; cat "$TMP/published-detail.json" || true; exit 27; }
python3 - "$TMP/published-detail.json" "$TEST_ITEM_ID" "$PUBLIC_URL" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert x['id']==sys.argv[2] and x['title']=='Oracle rehearsal item'
assert len(x['images'])==1 and x['images'][0]['imageUrl']==sys.argv[3]
PY
python3 "$STAGE/domain_exchange_e2e.py" "$BIND" "$DB" "$TEST_UID" "$ACCESS" "$TEST_ITEM_ID"
echo 'domain_media_object_bytes=PASS'
echo 'domain_listing_publish_rls=PASS'
echo 'domain_published_detail_rls=PASS'
unset PASS TOKEN_SHA
ROLLBACK=false
echo 'domain_service_role_nobypassrls=PASS'
echo 'domain_feed_database_rls=PASS'
echo 'domain_item_detail_database_rls=PASS'
echo 'domain_feed_gateway_auth=PASS'
echo 'domain_read_deploy=PASS production_traffic=false source_mutation=none'
