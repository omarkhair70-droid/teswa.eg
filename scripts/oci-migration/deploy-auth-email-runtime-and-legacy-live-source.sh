#!/usr/bin/env bash
set -Eeuo pipefail

# Live-source wrapper for the auth email rehearsal operator.
# The original rehearsal identity anchor contains 32 users. Production may gain
# additional Google users before final cutover; that growth must not block
# migration of the single legacy email/password credential, provided the email
# credential shape remains unique and the target already contains its anchored
# UUID. Final identity/data parity is intentionally re-captured at cutover.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="$ROOT/scripts/oci-migration/deploy-auth-email-runtime-and-legacy.sh"
[ -f "$BASE" ] || { echo 'auth_email_live_source=FAIL reason=base_operator_missing' >&2; exit 2; }

PATCHED="$(mktemp "$ROOT/scripts/oci-migration/.auth-email-live-source.XXXXXX.sh")"
cleanup() { rm -f "$PATCHED"; }
trap cleanup EXIT

python3 - "$BASE" "$PATCHED" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1]).read_text(encoding='utf-8')

old_shell = '''  [ "$TOTAL_USERS" = 32 ] || { echo "auth_email_final_operator=FAIL reason=source_identity_count_changed count=$TOTAL_USERS" >&2; exit 5; }'''
new_shell = '''  [ "$TOTAL_USERS" -ge 32 ] || { echo "auth_email_final_operator=FAIL reason=source_identity_count_regressed count=$TOTAL_USERS" >&2; exit 5; }
  echo "source_auth_users=$TOTAL_USERS"
  echo "source_identity_drift_from_rehearsal=$((TOTAL_USERS-32))"'''

old_py = '''        if total_users != 32:\n            raise SystemExit(f'auth_email_final_operator=FAIL reason=source_identity_count_changed count={total_users}')'''
new_py = '''        if total_users < 32:\n            raise SystemExit(f'auth_email_final_operator=FAIL reason=source_identity_count_regressed count={total_users}')\n        print(f'source_auth_users={total_users}')\n        print(f'source_identity_drift_from_rehearsal={total_users-32}')'''

old_echo = "echo 'source_auth_users=32'\n"

if old_shell not in src or old_py not in src or old_echo not in src:
    raise SystemExit('auth_email_live_source=FAIL reason=base_operator_shape_changed')

src = src.replace(old_shell, new_shell, 1)
src = src.replace(old_py, new_py, 1)
src = src.replace(old_echo, '', 1)

Path(sys.argv[2]).write_text(src, encoding='utf-8')
PY

chmod 700 "$PATCHED"
echo 'live_source_identity_growth_policy=ALLOW_ADDITIONAL_GOOGLE_USERS_REHEARSAL_ONLY'
echo 'final_cutover_identity_refresh=REQUIRED'
bash "$PATCHED"
echo 'auth_email_live_source_wrapper=PASS'
