#!/usr/bin/env bash
set -Eeuo pipefail
STAGE="${1:?stage directory required}"
P=/usr/pgsql-17/bin/psql
DB=teswa_rehearsal
SQL="$STAGE/runtime-auth-email-foundation.sql"

sudo -n true || { echo 'auth_email_foundation=FAIL reason=no_passwordless_sudo'; exit 10; }
[ "$(hostname -s)" = core01 ] || { echo 'auth_email_foundation=FAIL reason=unexpected_guest_hostname'; exit 11; }
systemctl is-active --quiet postgresql-17 || { echo 'auth_email_foundation=FAIL reason=postgres_inactive'; exit 12; }
[ -f "$SQL" ] || { echo 'auth_email_foundation=FAIL reason=sql_missing'; exit 13; }
systemctl is-active --quiet teswa-auth-shadow || { echo 'auth_email_foundation=FAIL reason=durable_auth_service_not_active'; exit 14; }

sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$SQL"
echo 'auth_email_schema_apply=PASS'

EXT="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM pg_extension WHERE extname='pgcrypto'")"
[ "$EXT" = 1 ] || { echo 'auth_email_foundation=FAIL reason=pgcrypto_missing'; exit 15; }
DIRECT="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT has_table_privilege('teswaauth','teswa_auth.email_accounts','SELECT') OR has_table_privilege('teswaauth','teswa_auth.email_accounts','INSERT') OR has_table_privilege('teswaauth','teswa_auth.email_accounts','UPDATE') OR has_table_privilege('teswaauth','teswa_auth.email_confirmation_tokens','SELECT')")"
[ "$DIRECT" = f ] || { echo 'auth_email_foundation=FAIL reason=direct_table_access'; exit 16; }
IMPORT_EXEC="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT has_function_privilege('teswaauth','teswa_auth.import_legacy_email_account(uuid,text,text,timestamptz,timestamptz,timestamptz)','EXECUTE')")"
[ "$IMPORT_EXEC" = f ] || { echo 'auth_email_foundation=FAIL reason=legacy_import_exposed'; exit 17; }

echo 'auth_email_database_auth=unix_peer_no_password'
echo 'auth_email_direct_table_access=false'
echo 'legacy_import_runtime_exposed=false'

TEST_UID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
TOKEN="$(printf 'teswa-email-confirmation-rehearsal-only' | sha256sum | awk '{print $1}')"
OUT="$(sudo -u teswaauth "$P" -X -qAt -F '|' -v ON_ERROR_STOP=1 -d "$DB" \
  -v uid="$TEST_UID" -v token="$TOKEN" <<'SQL'
BEGIN;
SELECT 'bootstrap='||teswa_auth.bootstrap_email_signup(:'uid'::uuid,'lane4-email-test@teswa.invalid','Teswa-Rehearsal-Password-2026','Lane4 Email Test',:'token',now()+interval '20 minutes');
SELECT 'before_confirm='||email_confirmed::text FROM teswa_auth.verify_email_password('lane4-email-test@teswa.invalid','Teswa-Rehearsal-Password-2026');
SELECT 'wrong_password_rows='||count(*)::text FROM teswa_auth.verify_email_password('lane4-email-test@teswa.invalid','wrong-password');
SELECT 'confirmed_user='||coalesce(teswa_auth.consume_email_confirmation(:'token')::text,'');
SELECT 'after_confirm='||email_confirmed::text FROM teswa_auth.verify_email_password('lane4-email-test@teswa.invalid','Teswa-Rehearsal-Password-2026');
ROLLBACK;
SQL
)"
printf '%s\n' "$OUT"
grep -qx 'bootstrap=true' <<<"$OUT" || { echo 'auth_email_foundation=FAIL reason=bootstrap'; exit 18; }
grep -qx 'before_confirm=false' <<<"$OUT" || { echo 'auth_email_foundation=FAIL reason=preconfirm_state'; exit 19; }
grep -qx 'wrong_password_rows=0' <<<"$OUT" || { echo 'auth_email_foundation=FAIL reason=password_rejection'; exit 20; }
grep -qx "confirmed_user=$TEST_UID" <<<"$OUT" || { echo 'auth_email_foundation=FAIL reason=confirmation'; exit 21; }
grep -qx 'after_confirm=true' <<<"$OUT" || { echo 'auth_email_foundation=FAIL reason=postconfirm_state'; exit 22; }

USERS="$(sudo -u postgres "$P" -d "$DB" -Atqc 'SELECT count(*) FROM teswa_identity.users')"
[ "$USERS" = 32 ] || { echo "auth_email_foundation=FAIL reason=self_test_rollback_identity_count_$USERS"; exit 23; }
TEST_LEFT="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_auth.email_accounts WHERE email='lane4-email-test@teswa.invalid'")"
[ "$TEST_LEFT" = 0 ] || { echo 'auth_email_foundation=FAIL reason=self_test_residue'; exit 24; }

echo 'email_password_bcrypt_verify=PASS'
echo 'email_signup_bootstrap=PASS'
echo 'email_confirmation_state_machine=PASS'
echo 'email_wrong_password_rejection=PASS'
echo 'email_signup_rollback_clean=PASS'
echo 'existing_identity_users=32'
echo 'legacy_email_credential_import=DEFERRED_SECURE_SOURCE_TRANSFER'
echo 'outbound_confirmation_email=false'
echo 'supabase_runtime_dependency=false'
echo 'supabase_mutation=none'
echo 'production_cutover=none'
echo 'app_traffic_switch=none'
echo 'auth_email_foundation=PASS'
