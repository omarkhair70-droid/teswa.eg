#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage directory required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal
APP=/opt/teswa/auth-shadow
UNIT=/etc/systemd/system/teswa-auth-shadow.service
SECRET=/etc/teswa/auth-shadow-session.key
IDENTITY="$APP/identity-map.json"
CONFIG="$APP/config.json"
SQL="$STAGE/runtime-auth-email-service.sql"
SERVER="$STAGE/auth-email-runtime-server.py"
CRED="$STAGE/legacy-email.json"

sudo -n true || { echo 'auth_email_runtime=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'auth_email_runtime=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'auth_email_runtime=FAIL reason=postgres_inactive'; exit 12; }
for f in "$SQL" "$SERVER" "$CRED" "$IDENTITY" "$CONFIG" "$SECRET" "$UNIT"; do
  sudo test -e "$f" || { echo "auth_email_runtime=FAIL reason=missing_asset path=$f"; exit 13; }
done

BASE_OK="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT (to_regclass('teswa_auth.email_accounts') IS NOT NULL AND to_regclass('teswa_auth.sessions') IS NOT NULL AND to_regclass('teswa_identity.users') IS NOT NULL)::text")"
[ "$BASE_OK" = t ] || { echo 'auth_email_runtime=FAIL reason=auth_foundation_missing'; exit 14; }

python3 - "$CRED" <<'PY'
import json,sys,uuid
x=json.load(open(sys.argv[1]))
assert set(x) >= {'user_id','email','password_hash','email_confirmed_at','created_at','updated_at'}
uuid.UUID(x['user_id'])
assert isinstance(x['email'],str) and '@' in x['email']
assert isinstance(x['password_hash'],str) and x['password_hash'].startswith(('$2a$','$2b$','$2y$')) and len(x['password_hash']) >= 50
print('legacy_email_credential_payload_validation=PASS')
PY

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$SQL"
echo 'auth_email_runtime_schema_apply=PASS'

# Import the one real credential without ever placing the email/hash in argv or stdout.
python3 - "$CRED" "$P" "$DB" <<'PY'
import base64,json,subprocess,sys,uuid
x=json.load(open(sys.argv[1])); psql=sys.argv[2]; db=sys.argv[3]
def txt(v):
    b=base64.b64encode(v.encode()).decode()
    return f"convert_from(decode('{b}','base64'),'UTF8')"
def ts(v):
    return 'NULL' if v is None else f"{txt(v)}::timestamptz"
uid=str(uuid.UUID(x['user_id']))
sql=f"SELECT teswa_auth.import_legacy_email_account('{uid}'::uuid,{txt(x['email'])},{txt(x['password_hash'])},{ts(x.get('email_confirmed_at'))},{ts(x.get('created_at'))},{ts(x.get('updated_at'))});"
proc=subprocess.run(['sudo','-u','postgres',psql,'-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],input=sql.encode(),capture_output=True,check=False)
if proc.returncode != 0 or proc.stdout.decode().strip() != 't':
    raise SystemExit('auth_email_runtime=FAIL reason=legacy_import_failed')
# Compare the exact stored hash to the source material without printing either value.
check=f"SELECT count(*)=1 AND bool_and(password_hash={txt(x['password_hash'])}) FROM teswa_auth.email_accounts WHERE user_id='{uid}'::uuid AND lower(email)=lower({txt(x['email'])}) AND source='supabase_migrated';"
proc=subprocess.run(['sudo','-u','postgres',psql,'-X','-qAt','-v','ON_ERROR_STOP=1','-d',db],input=check.encode(),capture_output=True,check=False)
if proc.returncode != 0 or proc.stdout.decode().strip() != 't':
    raise SystemExit('auth_email_runtime=FAIL reason=legacy_hash_parity')
PY

echo 'legacy_email_identity_preserved=PASS'
echo 'legacy_email_credential_migration=PASS'
echo 'legacy_email_password_hash_exact_match=PASS'

EMAIL_COUNT="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_auth.email_accounts WHERE source='supabase_migrated'")"
[ "$EMAIL_COUNT" = 1 ] || { echo "auth_email_runtime=FAIL reason=legacy_email_account_count_$EMAIL_COUNT"; exit 15; }
EMAIL_IDENTITY_OK="$(python3 - "$CRED" "$P" "$DB" <<'PY'
import json,subprocess,sys
x=json.load(open(sys.argv[1])); uid=x['user_id']; psql=sys.argv[2]; db=sys.argv[3]
sql=f"SELECT (EXISTS(SELECT 1 FROM teswa_identity.users WHERE id='{uid}'::uuid) AND EXISTS(SELECT 1 FROM teswa_identity.external_identities WHERE provider='email' AND user_id='{uid}'::uuid))::text;"
p=subprocess.run(['sudo','-u','postgres',psql,'-X','-qAt','-d',db],input=sql.encode(),capture_output=True,check=False)
print(p.stdout.decode().strip() if p.returncode==0 else 'f')
PY
)"
[ "$EMAIL_IDENTITY_OK" = t ] || { echo 'auth_email_runtime=FAIL reason=legacy_email_identity_mapping'; exit 16; }

CLIENT_ID="$(sudo -u teswaauth python3 - "$CONFIG" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); v=x.get('google_web_client_id')
assert isinstance(v,str) and v.endswith('.apps.googleusercontent.com')
print(v)
PY
)"
[ -n "$CLIENT_ID" ] || { echo 'auth_email_runtime=FAIL reason=google_client_missing'; exit 17; }

chmod 0755 "$STAGE"
chmod 0644 "$SERVER"
sudo systemctl stop teswa-auth-shadow
sudo install -o root -g teswaauth -m 0640 "$SERVER" "$APP/server.py"
sudo systemctl daemon-reload
sudo systemctl enable --now teswa-auth-shadow >/dev/null

BODY=''
for _ in $(seq 1 20); do
  BODY="$(curl -fsS http://127.0.0.1:3110/healthz 2>/dev/null || true)"
  [ -n "$BODY" ] && break
  sleep 1
done
[ -n "$BODY" ] || { echo 'auth_email_runtime=FAIL reason=health_timeout'; sudo journalctl -u teswa-auth-shadow -n 40 --no-pager || true; exit 18; }
printf '%s' "$BODY" | python3 -c '
import json,sys
x=json.load(sys.stdin)
assert x["status"]=="ok" and x["mode"]=="teswa-auth-durable-shadow"
assert x["passwordAuth"] is True and x["signupBootstrap"] is True
assert x["durableSessions"] is True and x["refreshRotation"] is True
assert x["productionTraffic"] is False and x["supabaseRuntimeDependency"] is False
assert x["identityUsers"]==32 and x["identityMappings"]==32
assert x["confirmationDispatchConfigured"] is False and x["googlePositiveDeferred"] is True
'

echo 'auth_email_runtime_service_health=PASS'

# Synthetic HTTP E2E: sign-up -> resend -> internal confirmation -> password sign-in
# -> session restore -> refresh rotation -> replay rejection -> logout revocation.
STAMP="$(date +%s)"
TEST_EMAIL="lane4-auth-e2e-${STAMP}@teswa.invalid"
TEST_PASS='Teswa-E2E-Rehearsal-Password-2026'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' RETURN

code="$(curl -sS -o "$TMP/signup.json" -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" http://127.0.0.1:3110/v1/auth/sign-up)"
[ "$code" = 201 ] || { echo "auth_email_runtime=FAIL reason=signup_http_$code"; exit 19; }
TEST_UID="$(python3 - "$TMP/signup.json" <<'PY'
import json,sys,uuid
x=json.load(open(sys.argv[1])); assert x.get('session') is None and x.get('confirmation_required') is True
u=x['user']['id']; uuid.UUID(u); print(u)
PY
)"

code="$(curl -sS -o "$TMP/resend.json" -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"email\":\"$TEST_EMAIL\"}" http://127.0.0.1:3110/v1/auth/resend-confirmation)"
[ "$code" = 202 ] || { echo "auth_email_runtime=FAIL reason=resend_http_$code"; exit 20; }
TOKEN_SHA="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT t.token_sha256 FROM teswa_auth.email_confirmation_tokens t JOIN teswa_auth.email_accounts a ON a.user_id=t.user_id WHERE a.email='$TEST_EMAIL' AND t.consumed_at IS NULL ORDER BY t.created_at DESC LIMIT 1")"
[ ${#TOKEN_SHA} -eq 64 ] || { echo 'auth_email_runtime=FAIL reason=confirmation_token_missing'; exit 21; }
CONFIRMED="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT coalesce(teswa_auth.consume_email_confirmation('$TOKEN_SHA')::text,'')")"
[ "$CONFIRMED" = "$TEST_UID" ] || { echo 'auth_email_runtime=FAIL reason=internal_confirmation'; exit 22; }
unset TOKEN_SHA CONFIRMED

code="$(curl -sS -o "$TMP/login.json" -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" http://127.0.0.1:3110/v1/auth/sign-in/password)"
[ "$code" = 200 ] || { echo "auth_email_runtime=FAIL reason=password_signin_http_$code"; exit 23; }
read -r ACCESS REFRESH < <(python3 - "$TMP/login.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert x['authenticated'] is True and x['provider']=='email'; print(x['access_token'],x['refresh_token'])
PY
)

code="$(curl -sS -o "$TMP/session.json" -w '%{http_code}' -H "Authorization: Bearer $ACCESS" http://127.0.0.1:3110/v1/auth/session)"
[ "$code" = 200 ] || { echo "auth_email_runtime=FAIL reason=session_restore_http_$code"; exit 24; }

code="$(curl -sS -o "$TMP/refresh.json" -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"refresh_token\":\"$REFRESH\"}" http://127.0.0.1:3110/v1/auth/refresh)"
[ "$code" = 200 ] || { echo "auth_email_runtime=FAIL reason=refresh_http_$code"; exit 25; }
read -r ACCESS2 REFRESH2 < <(python3 - "$TMP/refresh.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert x['authenticated'] is True; print(x['access_token'],x['refresh_token'])
PY
)

replay="$(curl -sS -o "$TMP/replay.json" -w '%{http_code}' -H 'Content-Type: application/json' --data "{\"refresh_token\":\"$REFRESH\"}" http://127.0.0.1:3110/v1/auth/refresh)"
[ "$replay" = 401 ] || { echo "auth_email_runtime=FAIL reason=refresh_replay_http_$replay"; exit 26; }

code="$(curl -sS -o "$TMP/logout.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $ACCESS2" http://127.0.0.1:3110/v1/auth/logout)"
[ "$code" = 200 ] || { echo "auth_email_runtime=FAIL reason=logout_http_$code"; exit 27; }
revoked="$(curl -sS -o "$TMP/revoked.json" -w '%{http_code}' -H "Authorization: Bearer $ACCESS2" http://127.0.0.1:3110/v1/auth/session)"
[ "$revoked" = 401 ] || { echo "auth_email_runtime=FAIL reason=revoked_session_http_$revoked"; exit 28; }
unset ACCESS ACCESS2 REFRESH REFRESH2 TEST_PASS

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" <<SQL >/dev/null
BEGIN;
DELETE FROM teswa_auth.sessions WHERE user_id='$TEST_UID'::uuid;
DELETE FROM teswa_auth.email_confirmation_tokens WHERE user_id='$TEST_UID'::uuid;
DELETE FROM teswa_auth.email_accounts WHERE user_id='$TEST_UID'::uuid;
DELETE FROM public.profiles WHERE id='$TEST_UID'::uuid;
DELETE FROM teswa_identity.external_identities WHERE user_id='$TEST_UID'::uuid;
DELETE FROM teswa_identity.users WHERE id='$TEST_UID'::uuid;
COMMIT;
SQL
rm -rf "$TMP"

USERS="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM teswa_identity.users')"
EMAILS="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM teswa_auth.email_accounts')"
[ "$USERS" = 32 ] && [ "$EMAILS" = 1 ] || { echo "auth_email_runtime=FAIL reason=e2e_cleanup users=$USERS email_accounts=$EMAILS"; exit 29; }

systemctl is-active --quiet teswa-auth-shadow || { echo 'auth_email_runtime=FAIL reason=service_inactive'; exit 30; }
systemctl is-enabled --quiet teswa-auth-shadow || { echo 'auth_email_runtime=FAIL reason=service_disabled'; exit 31; }
ss -ltnH | grep -Eq '[[:space:]]127\.0\.0\.1:3110[[:space:]]' || { echo 'auth_email_runtime=FAIL reason=local_listener_missing'; exit 32; }
if ss -ltnH | grep -Eq '[[:space:]](0\.0\.0\.0|\[::\]|\*):3110[[:space:]]'; then echo 'auth_email_runtime=FAIL reason=public_listener'; exit 33; fi
if systemctl is-active --quiet firewalld && sudo firewall-cmd --quiet --query-port=3110/tcp; then echo 'auth_email_runtime=FAIL reason=firewall_open'; exit 34; fi

SERVER_SHA="$(sudo sha256sum "$APP/server.py" | awk '{print $1}')"
printf '%s\n' \
  'password_signin_e2e=PASS' \
  'signup_bootstrap_http_e2e=PASS' \
  'resend_confirmation_endpoint=PASS' \
  'session_restore=PASS' \
  'refresh_rotation_http_e2e=PASS' \
  'refresh_replay_rejected=PASS' \
  'logout_revocation_http_e2e=PASS' \
  'synthetic_auth_e2e_cleanup=PASS' \
  'legacy_email_accounts=1' \
  'identity_users=32' \
  'service_active=true' \
  'service_enabled=true' \
  'listen_address=127.0.0.1' \
  'firewall_3110_open=false' \
  "server_sha256=$SERVER_SHA" \
  'supabase_runtime_dependency=false' \
  'supabase_mutation=none' \
  'production_cutover=none' \
  'app_traffic_switch=none' \
  'google_positive_app_e2e=DEFERRED_TO_APP_ADAPTER' \
  'signup_confirmation_delivery=DEFERRED_PROVIDER' \
  'auth_email_runtime_without_google=PASS'
