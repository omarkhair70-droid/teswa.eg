#!/usr/bin/env bash
set -Eeuo pipefail
export USER="${USER:-$(id -un)}"
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="$ROOT/scripts/oci-migration/deploy-auth-email-runtime-and-legacy.sh"
GUEST="$ROOT/scripts/oci-migration/auth-email-runtime-guest-deploy.sh"
SESSION_SQL="$ROOT/scripts/oci-migration/runtime-auth-session-foundation.sql"
EMAIL_FOUNDATION_SQL="$ROOT/scripts/oci-migration/runtime-auth-email-foundation.sql"

for f in "$BASE" "$GUEST" "$SESSION_SQL" "$EMAIL_FOUNDATION_SQL"; do
  [ -f "$f" ] || { echo "auth_email_self_heal=FAIL reason=missing_repo_asset path=$f" >&2; exit 2; }
done

[ -n "${TESWA_SOURCE_DATABASE_URL:-${SUPABASE_DB_URL:-}}" ] || {
  echo 'auth_email_self_heal=FAIL reason=source_database_url_missing' >&2
  exit 3
}

PATCHED_GUEST="$(mktemp "$ROOT/scripts/oci-migration/.auth-email-guest-self-heal.XXXXXX.sh")"
PATCHED_BASE="$(mktemp "$ROOT/scripts/oci-migration/.auth-email-base-self-heal.XXXXXX.sh")"
cleanup() { rm -f "$PATCHED_GUEST" "$PATCHED_BASE"; }
trap cleanup EXIT

python3 - "$GUEST" "$PATCHED_GUEST" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text(encoding='utf-8')

anchor='''SQL="$STAGE/runtime-auth-email-service.sql"\nSERVER="$STAGE/auth-email-runtime-server.py"\nCRED="$STAGE/legacy-email.json"'''
replacement='''SQL="$STAGE/runtime-auth-email-service.sql"\nSERVER="$STAGE/auth-email-runtime-server.py"\nSESSION_SQL="$STAGE/runtime-auth-session-foundation.sql"\nEMAIL_FOUNDATION_SQL="$STAGE/runtime-auth-email-foundation.sql"\nCRED="$STAGE/legacy-email.json"'''
if anchor not in src:
    raise SystemExit('auth_email_self_heal=FAIL reason=guest_header_shape_changed')
src=src.replace(anchor,replacement,1)

old_for='''for f in "$SQL" "$SERVER" "$CRED" "$IDENTITY" "$CONFIG" "$SECRET" "$UNIT"; do'''
new_for='''for f in "$SQL" "$SERVER" "$SESSION_SQL" "$EMAIL_FOUNDATION_SQL" "$CRED" "$IDENTITY" "$CONFIG" "$SECRET" "$UNIT"; do'''
if old_for not in src:
    raise SystemExit('auth_email_self_heal=FAIL reason=guest_asset_guard_shape_changed')
src=src.replace(old_for,new_for,1)

old='''BASE_OK="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT (to_regclass('teswa_auth.email_accounts') IS NOT NULL AND to_regclass('teswa_auth.sessions') IS NOT NULL AND to_regclass('teswa_identity.users') IS NOT NULL)::text")"\n[ "$BASE_OK" = t ] || { echo 'auth_email_runtime=FAIL reason=auth_foundation_missing'; exit 14; }'''
new='''echo 'auth_foundation_same_command_repair=START'\nIDENTITY_COUNT="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT count(*) FROM teswa_identity.users" 2>/dev/null || echo MISSING)"\n[ "$IDENTITY_COUNT" = 32 ] || { echo "auth_email_runtime=FAIL reason=identity_anchor_state value=$IDENTITY_COUNT"; exit 14; }\n\nif ! sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$SESSION_SQL" >/var/tmp/teswa-auth-session-self-heal.log 2>&1; then\n  echo 'auth_email_runtime=FAIL reason=session_foundation_apply'\n  tail -n 80 /var/tmp/teswa-auth-session-self-heal.log || true\n  rm -f /var/tmp/teswa-auth-session-self-heal.log\n  exit 14\nfi\nrm -f /var/tmp/teswa-auth-session-self-heal.log\necho 'auth_session_foundation_same_command=PASS'\n\nif ! sudo -u postgres "$P" -X -v ON_ERROR_STOP=1 -d "$DB" < "$EMAIL_FOUNDATION_SQL" >/var/tmp/teswa-auth-email-self-heal.log 2>&1; then\n  echo 'auth_email_runtime=FAIL reason=email_foundation_apply'\n  tail -n 80 /var/tmp/teswa-auth-email-self-heal.log || true\n  rm -f /var/tmp/teswa-auth-email-self-heal.log\n  exit 14\nfi\nrm -f /var/tmp/teswa-auth-email-self-heal.log\necho 'auth_email_foundation_same_command=PASS'\n\nBASE_DETAIL="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT 'identity='||(to_regclass('teswa_identity.users') IS NOT NULL)::text||',sessions='||(to_regclass('teswa_auth.sessions') IS NOT NULL)::text||',email_accounts='||(to_regclass('teswa_auth.email_accounts') IS NOT NULL)::text||',confirmation_tokens='||(to_regclass('teswa_auth.email_confirmation_tokens') IS NOT NULL)::text")"\necho "auth_foundation_catalog=$BASE_DETAIL"\nBASE_OK="$(sudo -u postgres "$P" -d "$DB" -Atqc "SELECT (to_regclass('teswa_auth.email_accounts') IS NOT NULL AND to_regclass('teswa_auth.sessions') IS NOT NULL AND to_regclass('teswa_identity.users') IS NOT NULL AND to_regclass('teswa_auth.email_confirmation_tokens') IS NOT NULL)::text")"\n[ "$BASE_OK" = t ] || { echo 'auth_email_runtime=FAIL reason=auth_foundation_missing_after_same_command_repair'; exit 14; }\necho 'auth_foundation_same_command_guard=PASS' '''
if old not in src:
    raise SystemExit('auth_email_self_heal=FAIL reason=guest_foundation_guard_shape_changed')
src=src.replace(old,new,1)
Path(sys.argv[2]).write_text(src,encoding='utf-8')
PY
chmod 700 "$PATCHED_GUEST"

python3 - "$BASE" "$PATCHED_BASE" "$PATCHED_GUEST" <<'PY'
from pathlib import Path
import sys
src=Path(sys.argv[1]).read_text(encoding='utf-8')
out=Path(sys.argv[2]); patched_guest=sys.argv[3]

# Live source can grow after the 32-user rehearsal snapshot. Keep the one
# legacy email credential shape strict, but allow additional source identities
# until the mandatory fresh cutover capture.
old_shell='''  [ "$TOTAL_USERS" = 32 ] || { echo "auth_email_final_operator=FAIL reason=source_identity_count_changed count=$TOTAL_USERS" >&2; exit 5; }'''
new_shell='''  [ "$TOTAL_USERS" -ge 32 ] || { echo "auth_email_final_operator=FAIL reason=source_identity_count_regressed count=$TOTAL_USERS" >&2; exit 5; }\n  echo "source_auth_users=$TOTAL_USERS"\n  echo "source_identity_drift_from_rehearsal=$((TOTAL_USERS-32))"'''
old_py='''        if total_users != 32:\n            raise SystemExit(f'auth_email_final_operator=FAIL reason=source_identity_count_changed count={total_users}')'''
new_py='''        if total_users < 32:\n            raise SystemExit(f'auth_email_final_operator=FAIL reason=source_identity_count_regressed count={total_users}')\n        print(f'source_auth_users={total_users}')\n        print(f'source_identity_drift_from_rehearsal={total_users-32}')'''
if old_shell not in src or old_py not in src:
    raise SystemExit('auth_email_self_heal=FAIL reason=base_live_source_shape_changed')
src=src.replace(old_shell,new_shell,1).replace(old_py,new_py,1)
src=src.replace("echo 'source_auth_users=32'\n",'',1)

old_for='''for f in runtime-auth-email-service.sql auth-email-runtime-server.py auth-email-runtime-guest-deploy.sh; do'''
new_for='''for f in runtime-auth-email-service.sql auth-email-runtime-server.py runtime-auth-session-foundation.sql runtime-auth-email-foundation.sql; do'''
if old_for not in src:
    raise SystemExit('auth_email_self_heal=FAIL reason=base_asset_guard_shape_changed')
src=src.replace(old_for,new_for,1)

old_copy='''cp "$ROOT/scripts/oci-migration/runtime-auth-email-service.sql" "$WORK/stage/"\ncp "$ROOT/scripts/oci-migration/auth-email-runtime-server.py" "$WORK/stage/"\ncp "$ROOT/scripts/oci-migration/auth-email-runtime-guest-deploy.sh" "$WORK/stage/"'''
new_copy=f'''cp "$ROOT/scripts/oci-migration/runtime-auth-email-service.sql" "$WORK/stage/"\ncp "$ROOT/scripts/oci-migration/auth-email-runtime-server.py" "$WORK/stage/"\ncp "$ROOT/scripts/oci-migration/runtime-auth-session-foundation.sql" "$WORK/stage/"\ncp "$ROOT/scripts/oci-migration/runtime-auth-email-foundation.sql" "$WORK/stage/"\ncp "{patched_guest}" "$WORK/stage/auth-email-runtime-guest-deploy.sh"'''
if old_copy not in src:
    raise SystemExit('auth_email_self_heal=FAIL reason=base_stage_copy_shape_changed')
src=src.replace(old_copy,new_copy,1)

old_tar='''tar -C "$WORK/stage" -czf "$ARCHIVE" runtime-auth-email-service.sql auth-email-runtime-server.py auth-email-runtime-guest-deploy.sh legacy-email.json'''
new_tar='''tar -C "$WORK/stage" -czf "$ARCHIVE" runtime-auth-email-service.sql auth-email-runtime-server.py runtime-auth-session-foundation.sql runtime-auth-email-foundation.sql auth-email-runtime-guest-deploy.sh legacy-email.json'''
if old_tar not in src:
    raise SystemExit('auth_email_self_heal=FAIL reason=base_tar_shape_changed')
src=src.replace(old_tar,new_tar,1)
out.write_text(src,encoding='utf-8')
PY
chmod 700 "$PATCHED_BASE"

echo 'auth_email_self_heal_mode=SAME_RUN_COMMAND_FOUNDATION_AND_RUNTIME'
echo 'live_source_identity_growth_policy=ALLOW_ADDITIONAL_USERS_REHEARSAL_ONLY'
echo 'final_cutover_identity_refresh=REQUIRED'
echo 'supabase_source_access=READ_ONLY'
echo 'oci_mutation_scope=TESWA_REHEARSAL_ONLY'

bash "$PATCHED_BASE"
echo 'auth_email_runtime_self_heal_full_operator=PASS'
